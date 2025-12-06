/**
 * SGIFO - Sistema de Gestión de Infraestructura de Fibra Óptica
 * Main Application Logic
 */

class MapManager {
    constructor(mapId) {
        this.defaultLocation = [4.6097, -74.0817]; // Bogota
        this.zoomLevel = 13;
        this.map = null;
        this.markers = {}; // Store markers by Node ID
        this.connections = {}; // Store polylines by Connection ID
        this.tempPolyline = null;
        this.userMarker = null;
    }

    init() {
        this.map = L.map('map').setView(this.defaultLocation, this.zoomLevel);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        this.map.on('click', (e) => {
            document.dispatchEvent(new CustomEvent('map:clicked', { detail: e.latlng }));
        });

        this.map.on('mousemove', (e) => {
            document.dispatchEvent(new CustomEvent('map:mousemove', { detail: e.latlng }));
        });
    }

    locateUser() {
        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalización.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const latlng = [lat, lng];

                this.map.setView(latlng, 16);

                if (this.userMarker) {
                    this.userMarker.setLatLng(latlng);
                } else {
                    this.userMarker = L.marker(latlng, {
                        icon: L.divIcon({
                            className: 'user-location-icon',
                            html: '<div style="background-color: #007bff; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>',
                            iconSize: [16, 16]
                        })
                    }).addTo(this.map);
                    this.userMarker.bindPopup("Estás aquí").openPopup();
                }
            },
            () => {
                alert("No se pudo obtener tu ubicación.");
            }
        );
    }

    addMarker(node) {
        if (!this.map) return;
        if (node.lat == null || node.lng == null) return;

        if (this.markers[node.id]) {
            this.map.removeLayer(this.markers[node.id]);
        }

        // Custom icon based on type
        let iconColor = this.getColorForType(node.type);

        // Check if node has connections
        const hasConnections = this.hasNodeConnections(node.id);
        const warningIcon = hasConnections ? '' : '<div style="position:absolute; top:-8px; right:-8px; font-size:12px;">⚠️</div>';

        // Check Provider Connectivity (if has connections)
        let internetIcon = '';
        if (hasConnections && window.inventoryManagerRef) {
            try {
                const hasInternet = window.inventoryManagerRef.checkProviderConnectivity(node.id);
                if (!hasInternet) {
                    internetIcon = '<div style="position:absolute; bottom:-5px; right:-5px; font-size:10px;" title="Sin Acceso a Internet">🌐🚫</div>';
                }
            } catch (e) {
                console.warn("Error checking provider connectivity for node", node.id, e);
            }
        }

        let iconHtml = `<div style="position:relative;"><div style="background-color: ${iconColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5);"></div>${warningIcon}${internetIcon}</div>`;

        if (node.type === 'ONU') {
            iconHtml = `<div style="position:relative;"><div style="background-color: ${iconColor}; width: 12px; height: 12px; border-radius: 2px; border: 1px solid white;">🏠</div>${warningIcon}${internetIcon}</div>`;
        }

        const marker = L.marker([node.lat, node.lng], {
            icon: L.divIcon({
                className: 'custom-node-icon',
                html: iconHtml,
                iconSize: [24, 24]
            })
        }).addTo(this.map);

        marker.bindTooltip(node.name, { permanent: false, direction: 'top' });

        marker.on('click', () => {
            document.dispatchEvent(new CustomEvent('marker:clicked', { detail: node.id }));
        });

        this.markers[node.id] = marker;
        return marker;
    }

    hasNodeConnections(nodeId) {
        // This will be set from UIManager
        if (!window.inventoryManagerRef) return true;

        // Check if node has any active (non-reported) connections
        const connections = window.inventoryManagerRef.getConnections();
        const hasActiveConnection = connections.some(c => {
            if (c.from === nodeId || c.to === nodeId) {
                // Check if connection or its ports are reported
                if (c.reported) return false;

                // Check if any port in the path is reported
                const fromNode = window.inventoryManagerRef.getNode(c.from);
                const toNode = window.inventoryManagerRef.getNode(c.to);

                if (fromNode && fromNode.type === 'RACK' && c.fromPort) {
                    const equip = fromNode.rack.find(e => e.id === c.fromPort.equipId);
                    if (equip) {
                        const port = equip.ports.find(p => p.id === c.fromPort.portId);
                        if (port && port.reported) return false;
                    }
                }

                if (toNode && toNode.type === 'RACK' && c.toPort) {
                    const equip = toNode.rack.find(e => e.id === c.toPort.equipId);
                    if (equip) {
                        const port = equip.ports.find(p => p.id === c.toPort.portId);
                        if (port && port.reported) return false;
                    }
                }

                return true;
            }
            return false;
        });

        return hasActiveConnection;
    }

    getColorForType(type) {
        switch (type) {
            case 'OLT': return '#800020';
            case 'NAP': return '#2ecc71';
            case 'MUFLA': return '#3498db';
            case 'ODF': return '#9b59b6';
            case 'ONU': return '#e67e22'; // Orange for clients
            default: return '#95a5a6';
        }
    }

    removeMarker(nodeId) {
        if (this.markers[nodeId]) {
            this.map.removeLayer(this.markers[nodeId]);
            delete this.markers[nodeId];
        }
    }

    // Updated to support waypoints
    addConnection(connection) {
        if (this.connections[connection.id]) {
            this.map.removeLayer(this.connections[connection.id]);
        }

        // Style based on cable type (optional visual distinction)
        let color = '#333';
        let weight = 3;

        if (connection.cableType === 'DROP') {
            color = '#e67e22'; // Orange for drops
            weight = 2;
        } else if (connection.cableType === 'SUBTERRANEO') {
            color = '#8b4513'; // Brown for underground
        } else if (connection.cableType === 'ADSS') {
            color = '#333'; // Dark for aerial
        }

        const polyline = L.polyline(connection.path, { color: color, weight: weight, opacity: 0.7 }).addTo(this.map);

        // Make polyline clickable
        polyline.on('click', () => {
            document.dispatchEvent(new CustomEvent('connection:clicked', { detail: connection.id }));
        });

        this.connections[connection.id] = polyline;
        return polyline;
    }

    removeConnection(connectionId) {
        if (this.connections[connectionId]) {
            this.map.removeLayer(this.connections[connectionId]);
            delete this.connections[connectionId];
        }
    }

    highlightAffectedNetwork(nodeIds, connectionIds) {
        // Reset styles first (simplistic approach: reload all)
        // In a real app, we'd store original styles

        nodeIds.forEach(id => {
            if (this.markers[id]) {
                // this.markers[id].setIcon(new L.Icon.Default({ className: 'affected-marker' })); // Just a placeholder, better to change color
                // For now, let's just change opacity or add a popup
                this.markers[id].setOpacity(0.5);
            }
        });

        connectionIds.forEach(id => {
            if (this.connections[id]) {
                this.connections[id].setStyle({ color: 'red', weight: 5 });
            }
        });
    }

    resetNetworkStyles() {
        Object.values(this.connections).forEach(poly => {
            // Reset to default style logic (simplified)
            poly.setStyle({ color: '#333', weight: 3 });
        });
        Object.values(this.markers).forEach(marker => {
            marker.setOpacity(1);
        });
    }

    // Helper to calculate total distance of a path
    calculateDistance(latlngs) {
        let totalDistance = 0;
        for (let i = 0; i < latlngs.length - 1; i++) {
            const p1 = L.latLng(latlngs[i]);
            const p2 = L.latLng(latlngs[i + 1]);
            totalDistance += p1.distanceTo(p2);
        }
        return totalDistance;
    }

    // Visual feedback for drawing
    updateTempPolyline(points) {
        if (this.tempPolyline) {
            this.map.removeLayer(this.tempPolyline);
        }
        if (points.length > 0) {
            this.tempPolyline = L.polyline(points, { color: '#D4AF37', weight: 2, dashArray: '5, 10' }).addTo(this.map);
        }
    }

    clearTempPolyline() {
        if (this.tempPolyline) {
            this.map.removeLayer(this.tempPolyline);
            this.tempPolyline = null;
        }
    }

    refreshAllMarkers(inventoryManager) {
        const nodes = inventoryManager.getNodes();
        nodes.forEach(node => {
            this.addMarker(node);
        });
    }
}

class UserManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.user = null;
        this.profile = null;
        this.projects = [];
        this.currentProject = null;

        // DOM Elements
        this.loginModal = document.getElementById('modal-login');
        this.projectModal = document.getElementById('modal-projects');
        this.createProjectModal = document.getElementById('modal-create-project');

        this.loginForm = document.getElementById('form-login');
        this.createProjectForm = document.getElementById('form-create-project');

        this.loginError = document.getElementById('login-error');
        this.projectList = document.getElementById('project-list');

        this.bindEvents();
    }

    bindEvents() {
        this.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            await this.login(email, password);
        });

        const togglePassword = document.getElementById('toggle-password');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const passwordInput = document.getElementById('login-password');
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    togglePassword.innerText = '🙈';
                } else {
                    passwordInput.type = 'password';
                    togglePassword.innerText = '👁️';
                }
            });
        }

        document.getElementById('btn-create-project').addEventListener('click', () => {
            this.projectModal.classList.add('hidden');
            this.createProjectModal.classList.remove('hidden');
        });

        document.getElementById('btn-cancel-create-project').addEventListener('click', () => {
            this.createProjectModal.classList.add('hidden');
            this.projectModal.classList.remove('hidden');
        });

        this.createProjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-project-name').value;
            const desc = document.getElementById('new-project-desc').value;
            await this.createProject(name, desc);
        });

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                await supabaseClient.auth.signOut();
            });
        }
    }

    async init() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            this.user = session.user;
            await this.loadProfile();
        } else {
            this.showLogin();
        }

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN') {
                this.user = session.user;
                await this.loadProfile();
            } else if (event === 'SIGNED_OUT') {
                this.user = null;
                this.profile = null;
                this.showLogin();
                // Reset UI?
                window.location.reload();
            }
        });
    }

    showLogin() {
        this.loginModal.classList.remove('hidden');
    }

    hideLogin() {
        this.loginModal.classList.add('hidden');
    }

    async login(email, password) {
        this.loginError.style.display = 'none';
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            this.hideLogin();
        } catch (e) {
            this.loginError.innerText = e.message;
            this.loginError.style.display = 'block';
        }
    }

    async loadProfile() {
        try {
            let { data, error } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('id', this.user.id)
                .single();

            if (!data) {
                // If checking auth.users for super-admin or just default
                console.log("No profile found, assuming default or first login.");
                data = { role: 'tecnico', full_name: this.user.email };
            }

            this.profile = data;
            this.updateHeader();

            // If Client, load specific view?
            if (this.profile.role === 'cliente') {
                // TODO: Load Client Data directly
                alert("Vista de cliente no implementada completamente. Redirigiendo a vista segura.");
                // For now, let them see projects but limited?
            }

            await this.loadProjects();

        } catch (e) {
            console.error("Error loading profile", e);
        }
    }

    updateHeader() {
        const profileEl = document.querySelector('.user-profile span');
        if (profileEl) {
            profileEl.innerText = `${this.profile.role.toUpperCase()} | ${this.user.email}`;
        }
    }

    async loadProjects() {
        this.projectList.innerHTML = '<p class="empty-state">Cargando...</p>';
        this.projectModal.classList.remove('hidden');

        // Hide Create Button for non-admins
        const btnCreate = document.getElementById('btn-create-project');
        if (this.profile.role === 'tecnico' || this.profile.role === 'cliente') {
            if (btnCreate) btnCreate.style.display = 'none';
        } else {
            if (btnCreate) btnCreate.style.display = 'block';
        }

        let projects = [];

        try {
            if (this.profile.role === 'super-admin') {
                const { data } = await supabaseClient.from('projects').select('*');
                projects = data || [];
            } else {
                // Created by me
                const { data: created } = await supabaseClient.from('projects').select('*').eq('created_by', this.user.id);

                // Assigned to me
                const { data: assignments } = await supabaseClient.from('project_assignments').select('project_id').eq('user_id', this.user.id);
                const assignedIds = assignments ? assignments.map(a => a.project_id) : [];

                let assigned = [];
                if (assignedIds.length > 0) {
                    // Use 'in' filter properly
                    const { data } = await supabaseClient.from('projects').select('*').in('id', assignedIds);
                    assigned = data || [];
                }

                // Merge uniqueness
                const map = new Map();
                if (created) created.forEach(p => map.set(p.id, p));
                if (assigned) assigned.forEach(p => map.set(p.id, p));
                projects = Array.from(map.values());
            }

            this.renderProjects(projects);

        } catch (e) {
            console.error("Error loading projects", e);
            this.projectList.innerHTML = '<p class="empty-state" style="color:red">Error cargando proyectos.</p>';
        }
    }

    renderProjects(projects) {
        this.projectList.innerHTML = '';
        if (projects.length === 0) {
            this.projectList.innerHTML = '<p class="empty-state">No hay proyectos disponibles.</p>';
            return;
        }

        projects.forEach(p => {
            const item = document.createElement('div');
            item.className = 'nav-btn'; // Recycle style
            item.style.padding = '10px';
            item.style.marginBottom = '5px';
            item.style.border = '1px solid #eee';
            item.style.cursor = 'pointer';
            item.innerHTML = `<strong>${p.name}</strong><br><small>${p.description || ''}</small>`;
            item.addEventListener('click', () => this.selectProject(p));
            this.projectList.appendChild(item);
        });
    }

    async createProject(name, desc) {
        try {
            const { data, error } = await supabaseClient.from('projects').insert({
                name: name,
                description: desc,
                created_by: this.user.id
            }).select().single();

            if (error) throw error;

            this.createProjectModal.classList.add('hidden');
            this.projectModal.classList.remove('hidden');
            await this.loadProjects(); // Reload

        } catch (e) {
            alert("Error creando proyecto: " + e.message);
        }
    }

    selectProject(project) {
        this.currentProject = project;
        this.projectModal.classList.add('hidden');

        // Initialize Inventory with Project ID
        console.log("Selected Project:", project.name);

        // Update Window Title or Header
        document.querySelector('.sidebar-header p').innerText = `Proyecto: ${project.name}`;

        // Delegate to UIManager/InventoryManager
        if (this.uiManager) {
            this.uiManager.loadProject(project.id, this.profile.role);
        }

        // If Admin, show admin tools
        if (this.profile.role === 'super-admin') {
            // Maybe add a floating admin button or something?
            // For now, let's rely on the header profile click or new buttons?
            // Or better, inject an "Admin Panel" button in sidebar.
            if (window.adminManager) window.adminManager.init();
        }
    }
}

class AdminManager {
    constructor() {
        this.users = [];
        this.projects = [];
        this.modal = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.createAdminButton();
        this.createAdminModal();
        this.initialized = true;
    }

    createAdminButton() {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;

        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.id = 'btn-admin-panel';
        btn.style.marginTop = '20px';
        btn.style.backgroundColor = '#2c3e50';
        btn.innerHTML = '<span class="icon">⚙️</span> Panel Admin';
        btn.onclick = () => this.openAdminPanel();

        nav.appendChild(btn);
    }

    createAdminModal() {
        // Create Modal HTML dynamically
        const modalHtml = `
        <div id="modal-admin-panel" class="modal-overlay hidden" style="z-index: 2500;">
            <div class="modal-content" style="max-width: 800px; height: 80vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                    <h3>Panel de Super Admin</h3>
                    <button class="btn-secondary" onclick="document.getElementById('modal-admin-panel').classList.add('hidden')">Cerrar</button>
                </div>
                
                <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <button class="action-btn" id="tab-users" onclick="window.adminManager.switchTab('users')">Usuarios</button>
                    <button class="btn-secondary" id="tab-projects" onclick="window.adminManager.switchTab('projects')">Proyectos</button>
                </div>

                <div id="admin-content-users" style="flex:1; overflow-y:auto;">
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <button class="action-btn" style="padding:5px;" onclick="window.adminManager.refreshUsers()">🔄 Refrescar</button>
                        <button class="action-btn" style="background-color:#2ecc71; padding:5px;" onclick="window.adminManager.openCreateUserPrompt()">+ Nuevo Usuario</button>
                    </div>
                    <table style="width:100%; font-size:13px; border-collapse: collapse;">
                        <thead style="background:#f5f5f5; text-align:left;">
                            <tr>
                                <th style="padding:8px;">Email</th>
                                <th style="padding:8px;">Rol</th>
                                <th style="padding:8px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="admin-user-list"></tbody>
                    </table>
                </div>

                <div id="admin-content-projects" class="hidden" style="flex:1; overflow-y:auto;">
                     <button class="action-btn" style="margin-bottom:10px; padding:5px;" onclick="window.adminManager.refreshProjects()">🔄 Refrescar Proyectos</button>
                     <div id="admin-project-list"></div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = document.getElementById('modal-admin-panel');
    }

    async openCreateUserPrompt() {
        const email = prompt("Email del nuevo usuario:");
        if (!email) return;
        const password = prompt("Contraseña temporal:");
        if (!password) return;
        const role = prompt("Rol (super-admin, admin, tecnico, cliente):", "tecnico");
        if (!role) return;

        try {
            const resp = await fetch('/api/create_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role, full_name: email.split('@')[0] })
            });
            const res = await resp.json();
            if (res.success) {
                alert("Usuario creado exitosamente.");
                this.refreshUsers();
            } else {
                alert("Error: " + res.message);
            }
        } catch (e) {
            alert("Error de conexión: " + e.message);
        }
    }

    async resetPassword(userId) {
        const password = prompt("Ingrese la nueva contraseña:");
        if (!password) return;

        try {
            const resp = await fetch('/api/update_password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, new_password: password })
            });
            const res = await resp.json();
            if (res.success) {
                alert("Contraseña actualizada exitosamente.");
            } else {
                alert("Error: " + res.message);
            }
        } catch (e) {
            alert("Error de conexión: " + e.message);
        }
    }

    openAdminPanel() {
        this.modal.classList.remove('hidden');
        this.switchTab('users');
    }

    switchTab(tab) {
        document.getElementById('admin-content-users').classList.add('hidden');
        document.getElementById('admin-content-projects').classList.add('hidden');
        document.getElementById(`admin-content-${tab}`).classList.remove('hidden');

        // Toggle btn styles
        document.getElementById('tab-users').className = tab === 'users' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-projects').className = tab === 'projects' ? 'action-btn' : 'btn-secondary';

        if (tab === 'users') this.refreshUsers();
        if (tab === 'projects') this.refreshProjects();
    }

    async refreshUsers() {
        const tbody = document.getElementById('admin-user-list');
        tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

        try {
            const { data, error } = await supabaseClient.from('user_profiles').select('*').order('email');
            if (error) throw error;

            tbody.innerHTML = '';
            data.forEach(u => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                tr.innerHTML = `
                    <td style="padding:8px;">${u.email}</td>
                    <td style="padding:8px;">
                        <select onchange="window.adminManager.updateRole('${u.id}', this.value)" style="padding:2px;">
                            <option value="super-admin" ${u.role === 'super-admin' ? 'selected' : ''}>Super Admin</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="tecnico" ${u.role === 'tecnico' ? 'selected' : ''}>Técnico</option>
                            <option value="cliente" ${u.role === 'cliente' ? 'selected' : ''}>Cliente</option>
                        </select>
                    </td>
                    <td style="padding:8px; display:flex; gap:5px;">
                        <button class="btn-secondary" style="padding:2px 5px; font-size:11px;" onclick="window.adminManager.resetPassword('${u.id}')">🔑 Clave</button>
                        <button class="btn-danger" style="padding:2px 5px; font-size:11px;" onclick="window.adminManager.deleteUser('${u.id}')">🗑️ Eliminar</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="3" style="color:red">Error: ${e.message}</td></tr>`;
        }
    }

    async updateRole(userId, newRole) {
        try {
            const { error } = await supabaseClient.from('user_profiles').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            // alert('Rol actualizado');
        } catch (e) {
            alert('Error actualizando rol: ' + e.message);
        }
    }

    async deleteUser(userId) {
        if (!confirm("¿Estás seguro de eliminar este usuario? Perderá acceso a los proyectos.")) return;
        try {
            const { error } = await supabaseClient.from('user_profiles').delete().eq('id', userId);
            if (error) throw error;
            this.refreshUsers();
        } catch (e) {
            alert('Error eliminando usuario: ' + e.message);
        }
    }

    async refreshProjects() {
        const list = document.getElementById('admin-project-list');
        list.innerHTML = 'Cargando...';

        try {
            const { data: projects, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
            if (error) throw error;

            list.innerHTML = '';

            for (const p of projects) {
                const div = document.createElement('div');
                div.style.border = '1px solid #ccc';
                div.style.padding = '10px';
                div.style.marginBottom = '10px';
                div.style.borderRadius = '4px';

                // Fetch assignments count?
                // const { count } = await supabaseClient.from('project_assignments').select('*', { count: 'exact', head: true }).eq('project_id', p.id);

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${p.name}</strong>
                        <div>
                             <button class="btn-secondary" style="font-size:11px; padding:3px;" onclick="window.adminManager.manageProjectUsers('${p.id}', '${p.name}')">Gestionar Usuarios</button>
                             <button class="btn-danger" style="font-size:11px; padding:3px;" onclick="window.adminManager.deleteProject('${p.id}')">Eliminar</button>
                        </div>
                    </div>
                    <small>${p.description || 'Sin descripción'}</small>
                 `;
                list.appendChild(div);
            }
        } catch (e) {
            list.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    async deleteProject(projectId) {
        if (!confirm("ADVERTENCIA: ¿Eliminar proyecto? Esto borrará TODOS los nodos y conexiones asociados. No se puede deshacer.")) return;
        try {
            // Delete project (cascade should handle nodes/connections if well defined, but our script said ON DELETE CASCADE only for assignments and maybe others? 
            // In `start.py` we didn't define FK for nodes->projects explicitly in the Add Column step, so we might need manual cleanup or rely on logic.
            // Wait, `nodes` table add column didn't add REFERENCES. So we must delete manually or update schema.
            // Manual deletion is safer for now.

            await supabaseClient.from('nodes').delete().eq('project_id', projectId);
            await supabaseClient.from('connections').delete().eq('project_id', projectId);
            await supabaseClient.from('projects').delete().eq('id', projectId);

            this.refreshProjects();
        } catch (e) {
            alert("Error eliminando proyecto: " + e.message);
        }
    }

    async manageProjectUsers(projectId, projectName) {
        const email = prompt(`Ingrese el email del usuario para asignar al proyecto "${projectName}":\n(Deje vacío para cancelar)`);
        if (!email) return;

        // Find user by email
        try {
            const { data, error } = await supabaseClient.from('user_profiles').select('id').eq('email', email).single();
            if (error || !data) {
                alert("Usuario no encontrado (debe haberse registrado primero).");
                return;
            }

            // Assign
            const { error: assignError } = await supabaseClient.from('project_assignments').insert({
                project_id: projectId,
                user_id: data.id,
                assigned_by: (await supabaseClient.auth.getUser()).data.user.id
            });

            if (assignError) {
                if (assignError.code === '23505') alert("El usuario ya está asignado a este proyecto.");
                else throw assignError;
            } else {
                alert("Usuario asignado exitosamente.");
            }

        } catch (e) {
            alert("Error: " + e.message);
        }
    }
}

class InventoryManager {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.projectId = null;
    }

    async init(projectId) {
        if (typeof supabaseClient === 'undefined' || supabaseClient === null) {
            console.error('Supabase SDK not loaded or initialized');
            alert('Error crítico: No se pudo conectar con la base de datos. Por favor recarga la página.');
            return;
        }

        try {
            console.log(`Loading data from Supabase for Project ${projectId}...`);
            this.projectId = projectId;

            const { data: nodes, error: nodeError } = await supabaseClient
                .from('nodes')
                .select('*')
                .eq('project_id', projectId);

            if (nodeError) throw nodeError;
            this.nodes = nodes || [];

            const { data: connections, error: connError } = await supabaseClient
                .from('connections')
                .select('*')
                .eq('project_id', projectId);

            if (connError) throw connError;
            this.connections = connections || [];

            // Migration: Remove fiber.used from existing data (deprecated field)
            let needsUpdate = false;
            this.connections.forEach(conn => {
                if (conn.fiberDetails) {
                    conn.fiberDetails.forEach(fiber => {
                        if (fiber.hasOwnProperty('used')) {
                            delete fiber.used;
                            needsUpdate = true;
                        }
                    });
                }
            });

            // If we cleaned up any data, save it back
            if (needsUpdate) {
                console.log('Migrating fiber data: removing deprecated "used" field...');
                for (const conn of this.connections) {
                    if (conn.fiberDetails) {
                        await supabaseClient.from('connections').update({ fiberDetails: conn.fiberDetails }).eq('id', conn.id);
                    }
                }
                console.log('Migration complete.');
            }

            // Integrity Check: Remove terminations pointing to non-existent splitters
            let integrityUpdates = false;
            this.connections.forEach(conn => {
                if (conn.fiberDetails) {
                    conn.fiberDetails.forEach(fiber => {
                        // Check fromTermination
                        if (fiber.fromTermination && fiber.fromTermination.splitterId) {
                            const node = this.nodes.find(n => n.id === fiber.fromTermination.nodeId);
                            if (node) {
                                const splitterExists = node.splitters && node.splitters.find(s => s.id === fiber.fromTermination.splitterId);
                                if (!splitterExists) {
                                    console.warn(`Cleaning up orphaned fromTermination on connection ${conn.id} fiber ${fiber.number}`);
                                    fiber.fromTermination = null;
                                    integrityUpdates = true;
                                }
                            }
                        }
                        // Check toTermination
                        if (fiber.toTermination && fiber.toTermination.splitterId) {
                            const node = this.nodes.find(n => n.id === fiber.toTermination.nodeId);
                            if (node) {
                                const splitterExists = node.splitters && node.splitters.find(s => s.id === fiber.toTermination.splitterId);
                                if (!splitterExists) {
                                    console.warn(`Cleaning up orphaned toTermination on connection ${conn.id} fiber ${fiber.number}`);
                                    fiber.toTermination = null;
                                    integrityUpdates = true;
                                }
                            }
                        }
                    });
                }
            });

            if (integrityUpdates) {
                console.log('Saving integrity fixes...');
                for (const conn of this.connections) {
                    if (conn.fiberDetails) {
                        await supabaseClient.from('connections').update({ fiberDetails: conn.fiberDetails }).eq('id', conn.id);
                    }
                }
            }

            console.log(`Loaded ${this.nodes.length} nodes and ${this.connections.length} connections from Supabase.`);
        } catch (e) {
            console.error('Error loading from Supabase:', e);
            alert('Error cargando datos de la base de datos. Verifica tu conexión.');
        }
    }

    // Nodes
    async addNode(node) {
        // Ensure rack property exists
        if (!node.rack) node.rack = [];
        // Ensure splitters property exists for MUFLA and NAP nodes
        if ((node.type === 'MUFLA' || node.type === 'NAP') && !node.splitters) node.splitters = [];

        // Optimistic update
        this.nodes.push(node);

        try {
            // Prepare node data for Supabase (ensure all fields are present)
            const nodeData = {
                id: node.id,
                type: node.type,
                name: node.name,
                lat: node.lat,
                lng: node.lng,
                rack: node.rack || [],
                splitters: node.splitters || [],
                clientData: node.clientData || null,
                splitters: node.splitters || [],
                clientData: node.clientData || null,
                damageReports: node.damageReports || [],
                project_id: this.projectId
            };

            const { error } = await supabaseClient.from('nodes').insert(nodeData);
            if (error) {
                console.error('Supabase Error:', error);
                alert(`Error guardando nodo en base de datos: ${error.message}`);
                // Revert optimistic update
                this.nodes = this.nodes.filter(n => n.id !== node.id);
                return null;
            }
        } catch (e) {
            console.error('Exception inserting node:', e);
            alert('Error al guardar el nodo');
            this.nodes = this.nodes.filter(n => n.id !== node.id);
            return null;
        }
        return node;
    }

    getNode(id) {
        return this.nodes.find(n => n.id === id);
    }

    async updateNode(updatedNode) {
        const index = this.nodes.findIndex(n => n.id === updatedNode.id);
        if (index !== -1) {
            // Optimistic update
            const originalNode = this.nodes[index];
            this.nodes[index] = updatedNode;

            try {
                // Prepare node data for Supabase
                const nodeData = {
                    type: updatedNode.type,
                    name: updatedNode.name,
                    lat: updatedNode.lat,
                    lng: updatedNode.lng,
                    rack: updatedNode.rack || [],
                    splitters: updatedNode.splitters || [],
                    clientData: updatedNode.clientData || null,
                    damageReports: updatedNode.damageReports || []
                };

                const { error } = await supabaseClient.from('nodes').update(nodeData).eq('id', updatedNode.id);
                if (error) {
                    console.error('Supabase Error:', error);
                    alert(`Error actualizando nodo en base de datos: ${error.message}`);
                    // Revert optimistic update (simplified, might need deep copy)
                    this.nodes[index] = originalNode;
                }
            } catch (e) {
                console.error('Exception updating node:', e);
                alert('Error al actualizar el nodo');
                this.nodes[index] = originalNode;
            }
        }
    }

    async deleteNode(id) {
        const originalNodes = [...this.nodes];
        const originalConnections = [...this.connections];

        this.nodes = this.nodes.filter(n => n.id !== id);
        this.connections = this.connections.filter(c => c.from !== id && c.to !== id);

        try {
            const { error } = await supabaseClient.from('nodes').delete().eq('id', id);
            if (error) throw error;

            // Also delete connections involving this node
            const { error: connError } = await supabaseClient.from('connections').delete().or(`from.eq.${id},to.eq.${id}`);
            if (connError) throw connError;

        } catch (e) {
            console.error('Supabase Error deleting node:', e);
            alert('Error eliminando nodo de la base de datos.');
            // Revert
            this.nodes = originalNodes;
            this.connections = originalConnections;
        }
    }

    getNodes() {
        return this.nodes;
    }

    // Connections
    async addConnection(fromId, toId, path, cableType, fibers, fromPort, toPort, sectionType) {
        const newConnection = {
            id: Date.now().toString(),
            from: fromId,
            to: toId,
            path: path, // Array of [lat, lng]
            cableType: cableType,
            sectionType: sectionType || null, // TRONCAL, SUB_TRONCAL, TRAMO (null for DROP)
            fibers: fibers,
            fromPort: fromPort || null, // { equipId, portId } for RACK nodes
            toPort: toPort || null,      // { equipId, portId } for RACK nodes
            fiberDetails: this.initializeFiberDetails(parseInt(fibers)), // Initialize fiber array
            project_id: this.projectId
        };

        // Optimistic update
        this.connections.push(newConnection);

        try {
            const { error } = await supabaseClient.from('connections').insert(newConnection);
            if (error) {
                console.error('Supabase Error:', error);
                alert(`Error guardando conexión en base de datos: ${error.message}`);
                this.connections = this.connections.filter(c => c.id !== newConnection.id);
                return null;
            }
        } catch (e) {
            console.error('Exception inserting connection:', e);
            alert('Error al guardar la conexión');
            this.connections = this.connections.filter(c => c.id !== newConnection.id);
            return null;
        }
        return newConnection;
    }

    initializeFiberDetails(fiberCount) {
        // TIA-598 Standard Fiber Color Code
        const colorMap = [
            { name: 'Azul', hex: '#0066CC' },       // 1
            { name: 'Naranja', hex: '#FF8800' },    // 2
            { name: 'Verde', hex: '#00AA00' },      // 3
            { name: 'Café', hex: '#8B4513' },       // 4
            { name: 'Gris', hex: '#808080' },       // 5
            { name: 'Blanco', hex: '#FFFFFF' },     // 6
            { name: 'Rojo', hex: '#FF0000' },       // 7
            { name: 'Negro', hex: '#000000' },      // 8
            { name: 'Amarillo', hex: '#FFFF00' },   // 9
            { name: 'Violeta', hex: '#8B00FF' },    // 10
            { name: 'Rosa', hex: '#FF69B4' },       // 11
            { name: 'Verde Agua', hex: '#00CED1' }  // 12
        ];

        const fibers = [];
        for (let i = 1; i <= fiberCount; i++) {
            const colorInfo = colorMap[(i - 1) % colorMap.length];
            fibers.push({
                number: i,
                color: colorInfo.name,
                colorHex: colorInfo.hex,
                fromTermination: null, // { nodeId, splitterId, port }
                toTermination: null    // { nodeId, equipId, portId }
            });
        }
        return fibers;
    }

    getColorHex(colorName) {
        // Helper function to get hex color from name (for backward compatibility)
        const colorMap = {
            'Azul': '#0066CC',
            'Naranja': '#FF8800',
            'Verde': '#00AA00',
            'Café': '#8B4513',
            'Marrón': '#8B4513',  // Alias
            'Gris': '#808080',
            'Blanco': '#FFFFFF',
            'Rojo': '#FF0000',
            'Negro': '#000000',
            'Amarillo': '#FFFF00',
            'Violeta': '#8B00FF',
            'Rosa': '#FF69B4',
            'Verde Agua': '#00CED1',
            'Aguamarina': '#00CED1'  // Alias
        };
        return colorMap[colorName] || '#999999'; // Default gray if not found
    }

    getConnections() {
        return this.connections;
    }

    async deleteConnection(id) {
        const originalConnections = [...this.connections];
        this.connections = this.connections.filter(c => c.id !== id);

        try {
            const { error } = await supabaseClient.from('connections').delete().eq('id', id);
            if (error) throw error;
        } catch (e) {
            console.error('Supabase Error deleting connection:', e);
            alert('Error eliminando conexión de la base de datos.');
            this.connections = originalConnections;
        }
    }

    async updateConnection(updatedConnection) {
        const index = this.connections.findIndex(c => c.id === updatedConnection.id);
        if (index !== -1) {
            const originalConnection = this.connections[index];
            this.connections[index] = updatedConnection;

            try {
                // Prepare connection data (exclude id from update)
                const { id, ...connectionData } = updatedConnection;
                const { error } = await supabaseClient.from('connections').update(connectionData).eq('id', id);
                if (error) {
                    console.error('Supabase Error:', error);
                    alert(`Error actualizando conexión: ${error.message}`);
                    this.connections[index] = originalConnection;
                }
            } catch (e) {
                console.error('Exception updating connection:', e);
                this.connections[index] = originalConnection;
            }
        }
    }

    // Rack Management
    async addEquipmentToRack(nodeId, equipment) {
        const node = this.getNode(nodeId);
        if (node) {
            if (!node.rack) node.rack = [];

            // Initialize ports
            equipment.ports = [];
            for (let i = 1; i <= parseInt(equipment.totalPorts); i++) {
                equipment.ports.push({
                    id: `${equipment.id}-p${i}`,
                    number: i,
                    status: 'free',
                    connectedTo: null
                });
            }

            node.rack.push(equipment);
            await this.updateNode(node);
        }
    }

    getEquipment(nodeId, equipmentId) {
        const node = this.getNode(nodeId);
        if (!node || !node.rack) return null;
        return node.rack.find(e => e.id === equipmentId);
    }

    // Splitter Management
    async addSplitterToNode(nodeId, splitter) {
        const node = this.getNode(nodeId);
        if (node && (node.type === 'MUFLA' || node.type === 'NAP')) {
            if (!node.splitters) node.splitters = [];

            // Initialize splitter ports
            const portCount = splitter.type === '1x8' ? 8 : 16;
            splitter.outputPorts = [];
            for (let i = 1; i <= portCount; i++) {
                splitter.outputPorts.push({
                    portNumber: i,
                    used: false,
                    connectedTo: null // { connectionId, fiberNumber }
                });
            }

            node.splitters.push(splitter);
            await this.updateNode(node);
            return splitter;
        }
        return null;
    }

    getSplitter(nodeId, splitterId) {
        const node = this.getNode(nodeId);
        if (!node || !node.splitters) return null;
        return node.splitters.find(s => s.id === splitterId);
    }

    async deleteSplitter(nodeId, splitterId) {
        const node = this.getNode(nodeId);
        if (node && node.splitters) {
            node.splitters = node.splitters.filter(s => s.id !== splitterId);
            await this.updateNode(node);
        }
    }

    async patchPorts(nodeId, equip1Id, port1Id, equip2Id, port2Id) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        const equip1 = node.rack.find(e => e.id === equip1Id);
        const equip2 = node.rack.find(e => e.id === equip2Id);

        if (equip1 && equip2) {
            const port1 = equip1.ports.find(p => p.id === port1Id);
            const port2 = equip2.ports.find(p => p.id === port2Id);

            if (port1 && port2) {
                // Disconnect previous if any (simplified)

                // Connect
                port1.status = 'connected';
                port1.connectedTo = { equipId: equip2Id, portId: port2Id, equipName: equip2.name };

                port2.status = 'connected';
                port2.connectedTo = { equipId: equip1Id, portId: port1Id, equipName: equip1.name };

                await this.updateNode(node);
                return true;
            }
        }
        return false;
    }

    // Phase 4: Downstream Analysis
    getDownstreamImpact(startNodeId) {
        const affectedNodes = new Set();
        const affectedConnections = new Set();

        const traverse = (currentId, isStartNode = false) => {
            const currentNode = this.getNode(currentId);

            // Check if current node has unresolved damage reports (but not for the start node)
            if (!isStartNode && currentNode && currentNode.damageReports && currentNode.damageReports.length > 0) {
                const hasUnresolvedReports = currentNode.damageReports.some(r => !r.resolved);
                if (hasUnresolvedReports) {
                    // Stop traversing this branch if there are unresolved reports
                    return;
                }
            }

            // Find all connections starting from currentId
            const outgoing = this.connections.filter(c => c.from === currentId);

            outgoing.forEach(conn => {
                affectedConnections.add(conn.id);
                if (!affectedNodes.has(conn.to)) {
                    affectedNodes.add(conn.to);
                    traverse(conn.to, false); // Recursive step
                }
            });
        };

        traverse(startNodeId, true);

        return {
            nodes: Array.from(affectedNodes).map(id => this.getNode(id)),
            connectionIds: Array.from(affectedConnections)
        };
    }

    checkProviderConnectivity(startNodeId) {
        // BFS to find if connected to a Provider Router
        const visited = new Set();
        const queue = [startNodeId];
        visited.add(startNodeId);

        while (queue.length > 0) {
            const nodeId = queue.shift();
            const node = this.getNode(nodeId);

            if (!node) continue;

            // Check if this node has a Provider Router
            if (node.type === 'RACK' && node.rack) {
                const hasProvider = node.rack.some(eq => eq.type === 'ROUTER' && eq.isProvider);
                if (hasProvider) return true;
            }

            // Find neighbors
            const connections = this.connections.filter(c => c.from === nodeId || c.to === nodeId);
            connections.forEach(conn => {
                const neighborId = conn.from === nodeId ? conn.to : conn.from;
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push(neighborId);
                }
            });
        }

        return false;
    }
}

class UIManager {
    constructor(mapManager, inventoryManager) {
        this.mapManager = mapManager;
        this.inventoryManager = inventoryManager;

        // State
        this.isAddingNode = false;
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionWaypoints = [];
        this.tempLocation = null;
        this.currentNodeId = null;

        // Patching State
        this.patchingSource = null; // { equipId, portId }
        this.currentRackNodeId = null;
        this.currentEquipmentId = null;

        // DOM Elements
        this.views = {
            list: document.getElementById('view-list'),
            add: document.getElementById('view-add-node'),
            details: document.getElementById('view-node-details'),
            rack: document.getElementById('view-rack-details'),
            ports: document.getElementById('view-port-management'),
            connection: document.getElementById('view-connection-details'),
            splitter: document.getElementById('view-splitter-management')
        };

        this.connectionDetails = {
            title: document.getElementById('connection-detail-title'),
            fromName: document.getElementById('conn-from-name'),
            toName: document.getElementById('conn-to-name'),
            cableType: document.getElementById('conn-cable-type-display'),
            sectionType: document.getElementById('conn-section-type-display'),
            sectionTypeRow: document.getElementById('conn-section-type-row'),
            fibers: document.getElementById('conn-fibers-display'),
            distance: document.getElementById('conn-distance-display'),
            btnEdit: document.getElementById('btn-edit-connection'),
            btnDelete: document.getElementById('btn-delete-connection'),
            btnClose: document.getElementById('btn-close-connection')
        };

        this.currentConnectionId = null;

        this.form = {
            form: document.getElementById('add-node-form'),
            type: document.getElementById('node-type'),
            name: document.getElementById('node-name'),
            lat: document.getElementById('node-lat'),
            lng: document.getElementById('node-lng'),
            preview: document.getElementById('location-preview'),
            clientFields: document.getElementById('client-fields'),
            clientAddress: document.getElementById('client-address'),
            clientPlan: document.getElementById('client-plan')
        };

        this.details = {
            name: document.getElementById('detail-name'),
            type: document.getElementById('detail-type'),
            coords: document.getElementById('detail-coords'),
            extraInfo: document.getElementById('detail-extra-info'),
            btnConnect: document.getElementById('btn-start-connection'),
            btnReport: document.getElementById('btn-report-damage'),
            btnViewRack: document.getElementById('btn-view-rack'),
            btnDelete: document.getElementById('btn-delete-node'),
            btnClose: document.getElementById('btn-close-details'),
            reportResults: document.getElementById('damage-report-results'),
            impactSummary: document.getElementById('impact-summary'),
            impactList: document.getElementById('impact-list'),
            damageReportsSection: document.getElementById('damage-reports-section')
        };

        this.rackView = {
            nodeName: document.getElementById('rack-node-name'),
            list: document.getElementById('rack-list'),
            btnAdd: document.getElementById('btn-add-equipment'),
            btnClose: document.getElementById('btn-close-rack')
        };

        this.portView = {
            title: document.getElementById('port-view-title'),
            subtitle: document.getElementById('port-view-subtitle'),
            grid: document.getElementById('port-grid'),
            btnClose: document.getElementById('btn-close-ports')
        };
        this.modals = {
            connection: document.getElementById('modal-connection'),
            equipment: document.getElementById('modal-equipment'),
            fusion: document.getElementById('modal-fusion')
        };

        this.fusionUI = {
            cableA: document.getElementById('fusion-cable-a'),
            cableB: document.getElementById('fusion-cable-b'),
            listA: document.getElementById('fusion-list-a'),
            listB: document.getElementById('fusion-list-b'),
            btnConnect: document.getElementById('btn-fusion-connect'),
            btnDisconnect: document.getElementById('btn-fusion-disconnect'),
            btnClose: document.getElementById('btn-close-fusion')
        };

        this.modalForms = {
            connection: document.getElementById('form-connection'),
            equipment: document.getElementById('form-equipment'),
            connCableType: document.getElementById('conn-cable-type'),
            connSectionType: document.getElementById('conn-section-type'),
            connSectionGroup: document.getElementById('group-section-type'),
            connFibers: document.getElementById('conn-fibers'),

            equipName: document.getElementById('equip-name'),
            equipType: document.getElementById('equip-type'),
            equipPorts: document.getElementById('equip-ports'),
            equipIsProvider: document.getElementById('equip-is-provider'),
            equipProviderGroup: document.getElementById('equip-provider-group'),
            btnCancelConn: document.getElementById('btn-cancel-conn'),
            btnCancelEquip: document.getElementById('btn-cancel-equip')
        };

        this.patchingUI = {
            modal: document.getElementById('modal-patching'),
            title: document.getElementById('patch-title'),
            step1: document.getElementById('patch-step-1'),
            step2: document.getElementById('patch-step-2'),
            step3: document.getElementById('patch-step-3'),
            portInfo: document.getElementById('patch-port-info'),
            btnConnect: document.getElementById('btn-patch-connect'),
            btnDisconnect: document.getElementById('btn-patch-disconnect'),
            equipList: document.getElementById('patch-equip-list'),
            portList: document.getElementById('patch-port-list'),
            btnBack1: document.getElementById('btn-patch-back-1'),
            btnBack2: document.getElementById('btn-patch-back-2'),
            btnClose: document.getElementById('btn-close-patch')
        };

        this.rackPortSelectUI = {
            modal: document.getElementById('modal-rack-port-select'),
            title: document.getElementById('rack-port-select-title'),
            info: document.getElementById('rack-port-select-info'),
            step1: document.getElementById('rack-select-step-1'),
            step2: document.getElementById('rack-select-step-2'),
            equipList: document.getElementById('rack-select-equip-list'),
            portList: document.getElementById('rack-select-port-list'),
            equipName: document.getElementById('rack-select-equip-name'),
            btnBack: document.getElementById('btn-rack-select-back'),
            btnCancel: document.getElementById('btn-cancel-rack-select')
        };

        // Splitter Management UI
        this.splitterView = {
            view: document.getElementById('view-splitter-management'),
            nodeName: document.getElementById('splitter-node-name'),
            list: document.getElementById('splitter-list'),
            btnAdd: document.getElementById('btn-add-splitter'),
            btnClose: document.getElementById('btn-close-splitters')
        };

        this.splitterModals = {
            addSplitter: document.getElementById('modal-add-splitter'),
            splitterPorts: document.getElementById('modal-splitter-ports'),
            fiberConnection: document.getElementById('modal-fiber-connection'),
            formAddSplitter: document.getElementById('form-add-splitter'),
            splitterType: document.getElementById('splitter-type'),
            inputConnection: document.getElementById('splitter-input-connection'),
            fiberSelection: document.getElementById('splitter-fiber-selection'),
            fiberGrid: document.getElementById('fiber-grid'),
            btnCancelSplitter: document.getElementById('btn-cancel-splitter'),
            // Splitter Ports Modal
            portsTitle: document.getElementById('splitter-ports-title'),
            inputFiber: document.getElementById('splitter-input-fiber'),
            splitterTypeDisplay: document.getElementById('splitter-type-display'),
            outputList: document.getElementById('splitter-output-list'),
            btnClosePorts: document.getElementById('btn-close-splitter-ports'),
            btnDeleteSplitter: document.getElementById('btn-delete-splitter'),
            // Fiber Connection Modal
            fiberConnInfo: document.getElementById('fiber-conn-info'),
            fiberConnPort: document.getElementById('fiber-conn-port'),
            fiberConnStep1: document.getElementById('fiber-conn-step-1'),
            fiberConnStep2: document.getElementById('fiber-conn-step-2'),
            fiberConnStep3: document.getElementById('fiber-conn-step-3'),
            fiberDestNode: document.getElementById('fiber-dest-node'),
            fiberDestEquipList: document.getElementById('fiber-dest-equip-list'),
            fiberSelectGroup: document.getElementById('fiber-select-group'),
            fiberSelectFiber: document.getElementById('fiber-select-fiber'),
            fiberDestPortList: document.getElementById('fiber-dest-port-list'),
            btnFiberNext: document.getElementById('btn-fiber-next'),
            btnFiberBack1: document.getElementById('btn-fiber-back-1'),
            btnFiberBack2: document.getElementById('btn-fiber-back-2'),
            btnCancelFiberConn: document.getElementById('btn-cancel-fiber-conn')
        };

        // State for Splitter Management
        this.currentSplitterNodeId = null;
        this.currentSplitterId = null;
        this.selectedFiber = null;
        this.selectedSplitterPort = null;

        // Wizard State for Port Patching
        this.wizardState = {
            sourceEquipId: null,
            sourcePortId: null,
            targetEquipId: null
        };

        // Rack Port Selection State
        this.rackPortState = {
            nodeId: null,
            isSource: false,
            callback: null,
            selectedEquipId: null,
            selectedPortId: null
        };

        // Connection State
        this.pendingConnectionTarget = null;
        this.selectedSourcePort = null;
        this.selectedTargetPort = null;

        // Fusion State
        this.fusionState = {
            nodeId: null,
            selectedFiberA: null, // { connId, fiberNumber }
            selectedFiberB: null
        };
    }

    async init() {
        // Wait for User Manager to load project
        // Logic moved to loadProject
        this.setupEventListeners();
    }

    async loadProject(projectId, userRole) {
        this.userRole = userRole; // Store role for UI permissions
        await this.inventoryManager.init(projectId);
        this.loadExistingData();

        // Apply Role Restrictions
        if (this.userRole === 'tecnico' || this.userRole === 'cliente') {
            // Hide "Add Node" button
            document.getElementById('view-add-node').classList.add('hidden'); // This is the form
            // Hide quick action
            const btnAdd = document.getElementById('btn-add-node');
            if (btnAdd) btnAdd.style.display = 'none';

            // Hide Destructive/Edit Actions
            const elementsToHide = [
                'btn-delete-node',
                'btn-delete-connection',
                'btn-edit-connection',
                'btn-add-equipment',
                'btn-add-splitter',
                'btn-manage-fusions',
                'btn-manage-fusions-rack'
            ];

            elementsToHide.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    }

    switchView(viewName) {
        Object.values(this.views).forEach(el => {
            el.classList.remove('active');
            el.classList.add('hidden');
        });

        const view = this.views[viewName];
        if (view) {
            view.classList.remove('hidden');
            view.classList.add('active');
        }
    }

    setupEventListeners() {
        // Equipment Save Action (Click instead of Submit to prevent reload)
        const btnSaveEquip = document.getElementById('btn-save-equipment');
        if (btnSaveEquip) {
            btnSaveEquip.addEventListener('click', async (e) => {
                e.preventDefault(); // Just in case
                console.log('Save Equipment button clicked');

                // Fallback: if currentRackNodeId is missing but currentNodeId exists (and is the same node), use it
                if (!this.currentRackNodeId && this.currentNodeId) {
                    const node = this.inventoryManager.getNode(this.currentNodeId);
                    if (node && node.type === 'RACK') {
                        this.currentRackNodeId = this.currentNodeId;
                    }
                }

                if (!this.currentRackNodeId) {
                    console.error('No rack selected');
                    alert('No se ha seleccionado un rack. Intenta cerrar y volver a abrir el rack.');
                    return;
                }
                await this.finalizeAddEquipment();
            });
        }

        // Add Node
        document.getElementById('btn-add-node').addEventListener('click', () => this.startAddNodeFlow());
        document.getElementById('btn-cancel-add').addEventListener('click', () => this.cancelAddNode());
        document.getElementById('btn-locate-me').addEventListener('click', () => this.mapManager.locateUser());

        // Toggle Client Fields
        this.form.type.addEventListener('change', (e) => {
            if (e.target.value === 'ONU') {
                this.form.clientFields.classList.remove('hidden');
            } else {
                this.form.clientFields.classList.add('hidden');
            }
        });

        // Map Interactions
        document.addEventListener('map:clicked', (e) => {
            if (this.isAddingNode) {
                this.setFormLocation(e.detail);
            } else if (this.isConnecting) {
                this.addConnectionWaypoint(e.detail);
            }
        });

        document.addEventListener('map:mousemove', (e) => {
            if (this.isConnecting && this.connectionWaypoints.length > 0) {
                // Visualize line to cursor
                const points = [...this.connectionWaypoints, [e.detail.lat, e.detail.lng]];
                this.mapManager.updateTempPolyline(points);
            }
        });

        document.addEventListener('marker:clicked', (e) => {
            if (this.isConnecting) {
                this.completeConnection(e.detail);
            } else {
                this.showNodeDetails(e.detail);
            }
        });

        // Form Submit
        this.form.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveNode();
        });

        // Equipment Modal Actions
        this.modalForms.equipType.addEventListener('change', (e) => {
            if (e.target.value === 'ROUTER') {
                this.modalForms.equipProviderGroup.classList.remove('hidden');
            } else {
                this.modalForms.equipProviderGroup.classList.add('hidden');
                this.modalForms.equipIsProvider.checked = false;
            }
        });

        // Details Actions
        this.details.btnClose.addEventListener('click', () => {
            this.switchView('list');
            this.currentNodeId = null;
            this.mapManager.resetNetworkStyles();
        });

        this.details.btnDelete.addEventListener('click', () => {
            if (confirm('¿Estás seguro de eliminar este nodo?')) this.deleteCurrentNode();
        });

        this.details.btnConnect.addEventListener('click', () => {
            this.startConnectionFlow();
        });

        this.details.btnReport.addEventListener('click', () => {
            this.reportDamage();
        });

        this.details.btnViewRack.addEventListener('click', () => {
            this.showRackView();
        });

        // Rack Actions
        this.rackView.btnClose.addEventListener('click', () => {
            this.switchView('details');
        });

        this.rackView.btnAdd.addEventListener('click', () => {
            this.addEquipmentToRack();
        });

        // Port Actions
        this.portView.btnClose.addEventListener('click', () => {
            this.switchView('rack');
            this.currentEquipmentId = null;
            this.patchingSource = null; // Clear patching state
        });

        // Global Escape key listener for connection mode
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isConnecting) {
                this.cancelConnectionFlow();
            }
        });
        // Modal Actions
        if (this.modalForms.btnCancelConn) {
            this.modalForms.btnCancelConn.addEventListener('click', () => this.closeModal('connection'));
        }
        if (this.modalForms.btnCancelEquip) {
            this.modalForms.btnCancelEquip.addEventListener('click', () => this.closeModal('equipment'));
        }

        this.modalForms.connection.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.finalizeConnection();
        });

        // Show/Hide Section Type based on Cable Type
        this.modalForms.connCableType.addEventListener('change', (e) => {
            const isDrop = e.target.value === 'DROP';
            if (isDrop) {
                this.modalForms.connSectionGroup.classList.add('hidden');
            } else {
                this.modalForms.connSectionGroup.classList.remove('hidden');
            }
        });


        // Also prevent any accidental form submission (e.g., Enter key)
        this.modalForms.equipment.addEventListener('submit', (e) => {
            e.preventDefault();
        });

        // Patching Wizard Actions
        this.patchingUI.btnConnect.addEventListener('click', () => this.wizardGoToStep2());
        this.patchingUI.btnBack1.addEventListener('click', () => this.wizardGoToStep1());
        this.patchingUI.btnBack2.addEventListener('click', () => this.wizardGoToStep2());
        this.patchingUI.btnClose.addEventListener('click', () => this.closePatchingModal());
        this.patchingUI.btnDisconnect.addEventListener('click', () => this.disconnectPort());

        // Connection Details Actions
        this.connectionDetails.btnClose.addEventListener('click', () => this.switchView('list'));

        // Fusion Management Actions
        const btnManageFusions = document.getElementById('btn-manage-fusions');
        if (btnManageFusions) {
            btnManageFusions.addEventListener('click', () => this.openFusionModal());
        }

        const btnManageFusionsRack = document.getElementById('btn-manage-fusions-rack');
        if (btnManageFusionsRack) {
            btnManageFusionsRack.addEventListener('click', () => this.openFusionModal(true));
        }

        this.fusionUI.btnClose.addEventListener('click', () => {
            this.modals.fusion.classList.add('hidden');
            this.fusionState = { nodeId: null, selectedFiberA: null, selectedFiberB: null };
        });

        this.fusionUI.cableA.addEventListener('change', () => this.handleFusionCableChange('A'));
        this.fusionUI.cableB.addEventListener('change', () => this.handleFusionCableChange('B'));

        this.fusionUI.btnConnect.addEventListener('click', () => this.fusionConnect());
        this.fusionUI.btnDisconnect.addEventListener('click', () => this.fusionDisconnect());
        this.connectionDetails.btnEdit.addEventListener('click', () => this.editConnection());
        this.connectionDetails.btnDelete.addEventListener('click', async () => await this.deleteConnection());

        // Connection click event
        document.addEventListener('connection:clicked', (e) => {
            this.showConnectionDetails(e.detail);
        });

        // Rack Port Selection Actions
        this.rackPortSelectUI.btnCancel.addEventListener('click', () => this.closeRackPortSelect());
        this.rackPortSelectUI.btnBack.addEventListener('click', () => this.rackPortSelectGoToStep1());

        // Splitter Management Actions
        this.splitterView.btnClose.addEventListener('click', () => this.switchView('details'));
        this.splitterView.btnAdd.addEventListener('click', () => this.openAddSplitterModal());

        this.splitterModals.btnCancelSplitter.addEventListener('click', () => this.splitterModals.addSplitter.classList.add('hidden'));
        this.splitterModals.formAddSplitter.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.finalizeAddSplitter();
        });
        this.splitterModals.inputConnection.addEventListener('change', () => this.handleSplitterInputConnectionChange());

        this.splitterModals.btnClosePorts.addEventListener('click', () => this.splitterModals.splitterPorts.classList.add('hidden'));
        this.splitterModals.btnDeleteSplitter.addEventListener('click', async () => await this.deleteSplitter());

        this.splitterModals.btnCancelFiberConn.addEventListener('click', () => this.splitterModals.fiberConnection.classList.add('hidden'));
        this.splitterModals.btnFiberNext.addEventListener('click', () => this.fiberConnGoToStep2());
        this.splitterModals.btnFiberBack1.addEventListener('click', () => this.fiberConnGoToStep1());
        this.splitterModals.btnFiberBack2.addEventListener('click', () => this.fiberConnGoToStep2());
        this.splitterModals.fiberDestNode.addEventListener('change', () => this.handleFiberDestNodeChange());

        console.log('Event listeners set up successfully.');
    }

    closeModal(modalName) {
        this.modals[modalName].classList.add('hidden');
    }

    showConnectionModal() {
        console.log('Showing connection modal');
        this.modals.connection.classList.remove('hidden');
    }

    showEquipmentModal() {
        this.modals.equipment.classList.remove('hidden');
        this.modalForms.equipName.focus();

        // Reset and trigger change to set initial state
        this.modalForms.equipType.value = 'SWITCH';
        this.modalForms.equipType.dispatchEvent(new Event('change'));
        this.modalForms.equipIsProvider.checked = false;
    }


    // --- Add Node Flow ---
    startAddNodeFlow() {
        this.isAddingNode = true;
        this.switchView('add');
        this.resetForm();
        this.form.preview.innerHTML = "📍 Haz clic en el mapa para ubicar";
        this.form.preview.style.color = "var(--primary-color)";
    }

    cancelAddNode() {
        this.isAddingNode = false;
        this.switchView('list');
    }

    setFormLocation(latlng) {
        this.tempLocation = latlng;
        this.form.lat.value = latlng.lat;
        this.form.lng.value = latlng.lng;
        this.form.preview.innerHTML = `✅ Ubicación: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
        this.form.preview.style.color = "green";
    }

    async saveNode() {
        if (!this.tempLocation) {
            alert("Por favor selecciona una ubicación en el mapa.");
            return;
        }

        const newNode = {
            id: Date.now().toString(),
            type: this.form.type.value,
            name: this.form.name.value,
            lat: parseFloat(this.form.lat.value),
            lng: parseFloat(this.form.lng.value),
            rack: [] // Initialize empty rack
        };

        // Add client data if ONU
        if (newNode.type === 'ONU') {
            newNode.clientData = {
                address: this.form.clientAddress.value,
                plan: this.form.clientPlan.value
            };
        }

        const addedNode = await this.inventoryManager.addNode(newNode);

        if (addedNode) {
            this.mapManager.addMarker(addedNode);
            this.isAddingNode = false;
            this.switchView('list');
            this.refreshNodeList();
        }
        this.refreshNodeList();
    }

    // --- Connection Flow ---
    startConnectionFlow() {
        this.isConnecting = true;
        this.connectionSourceId = this.currentNodeId;
        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        this.connectionWaypoints = [[sourceNode.lat, sourceNode.lng]]; // Start at source

        // Visual feedback
        const btn = this.details.btnConnect;
        btn.textContent = "Modo Trazado (Esc para cancelar)";
        btn.disabled = true;

        alert("Modo Trazado Activo:\n1. Haz clic en el mapa para agregar puntos de quiebre.\n2. Haz clic en el nodo destino para finalizar.");
    }

    addConnectionWaypoint(latlng) {
        this.connectionWaypoints.push([latlng.lat, latlng.lng]);
        this.mapManager.updateTempPolyline(this.connectionWaypoints);
    }

    completeConnection(targetNodeId) {
        console.log('completeConnection called with:', targetNodeId);
        console.log('isConnecting:', this.isConnecting);
        console.log('connectionSourceId:', this.connectionSourceId);

        if (!this.isConnecting || !this.connectionSourceId) return;

        if (targetNodeId === this.connectionSourceId) {
            alert("No puedes conectar un nodo consigo mismo.");
            return;
        }

        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        const targetNode = this.inventoryManager.getNode(targetNodeId);

        console.log('Source Node:', sourceNode);
        console.log('Target Node:', targetNode);

        if (sourceNode && targetNode) {
            this.pendingConnectionTarget = targetNode;

            // Check if source or target is a RACK
            if (sourceNode.type === 'RACK' || targetNode.type === 'RACK') {
                console.log('Rack connection detected');
                // Need to select ports
                this.handleRackConnection(sourceNode, targetNode);
            } else {
                console.log('Normal connection');
                // Normal connection
                this.showConnectionModal();
            }
        }
    }

    handleRackConnection(sourceNode, targetNode) {
        // Determine which node is the rack
        if (sourceNode.type === 'RACK' && targetNode.type === 'RACK') {
            alert('No se puede conectar directamente dos RACKs. Conecta equipos específicos dentro de cada rack.');
            this.cancelConnectionFlow();
            return;
        }

        if (sourceNode.type === 'RACK') {
            // Select port from source rack
            this.openRackPortSelect(sourceNode.id, true, () => {
                // After selecting source port, show connection modal
                this.showConnectionModal();
            });
        } else if (targetNode.type === 'RACK') {
            // Select port from target rack
            this.openRackPortSelect(targetNode.id, false, () => {
                // After selecting target port, show connection modal
                this.showConnectionModal();
            });
        }
    }

    openRackPortSelect(nodeId, isSource, callback) {
        this.rackPortState.nodeId = nodeId;
        this.rackPortState.isSource = isSource;
        this.rackPortState.callback = callback;
        this.rackPortState.selectedEquipId = null;
        this.rackPortState.selectedPortId = null;

        const node = this.inventoryManager.getNode(nodeId);
        this.rackPortSelectUI.title.textContent = `Seleccionar Puerto - ${node.name}`;
        this.rackPortSelectUI.info.textContent = isSource ?
            'Selecciona el equipo y puerto de SALIDA de la señal.' :
            'Selecciona el equipo y puerto de ENTRADA de la señal.';

        this.rackPortSelectGoToStep1();
        this.rackPortSelectUI.modal.classList.remove('hidden');
    }

    rackPortSelectGoToStep1() {
        const node = this.inventoryManager.getNode(this.rackPortState.nodeId);
        const list = this.rackPortSelectUI.equipList;
        list.innerHTML = '';

        if (!node.rack || node.rack.length === 0) {
            list.innerHTML = '<p style="padding:10px; color:#666">No hay equipos en este rack.</p>';
        } else {
            node.rack.forEach(eq => {
                const item = document.createElement('div');
                item.className = 'nav-btn';
                item.style.borderBottom = '1px solid #eee';
                item.textContent = `${eq.name} (${eq.type})`;
                item.addEventListener('click', () => {
                    this.rackPortState.selectedEquipId = eq.id;
                    this.rackPortSelectGoToStep2();
                });
                list.appendChild(item);
            });
        }

        this.rackPortSelectUI.step1.classList.remove('hidden');
        this.rackPortSelectUI.step2.classList.add('hidden');
    }

    rackPortSelectGoToStep2() {
        const node = this.inventoryManager.getNode(this.rackPortState.nodeId);
        const equip = node.rack.find(e => e.id === this.rackPortState.selectedEquipId);

        this.rackPortSelectUI.equipName.textContent = `${equip.name} (${equip.type})`;

        const grid = this.rackPortSelectUI.portList;
        grid.innerHTML = '';

        equip.ports.forEach(port => {
            const btn = document.createElement('div');
            btn.className = 'port-item';
            btn.textContent = port.number;

            if (port.status === 'connected') {
                btn.style.backgroundColor = '#2ecc71';
                btn.style.color = 'white';
                btn.title = `Conectado a: ${port.connectedTo.equipName}`;
            } else {
                btn.style.backgroundColor = '#eee';
            }

            btn.addEventListener('click', () => {
                this.rackPortState.selectedPortId = port.id;
                this.finalizeRackPortSelect();
            });
            grid.appendChild(btn);
        });

        this.rackPortSelectUI.step1.classList.add('hidden');
        this.rackPortSelectUI.step2.classList.remove('hidden');
    }

    finalizeRackPortSelect() {
        // Store the selected port info
        if (this.rackPortState.isSource) {
            this.selectedSourcePort = {
                equipId: this.rackPortState.selectedEquipId,
                portId: this.rackPortState.selectedPortId
            };
        } else {
            this.selectedTargetPort = {
                equipId: this.rackPortState.selectedEquipId,
                portId: this.rackPortState.selectedPortId
            };
        }

        this.closeRackPortSelect();

        // Execute callback
        if (this.rackPortState.callback) {
            this.rackPortState.callback();
        }
    }

    closeRackPortSelect() {
        this.rackPortSelectUI.modal.classList.add('hidden');
    }

    async finalizeConnection() {
        if (!this.pendingConnectionTarget || !this.connectionSourceId) return;

        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        const targetNode = this.pendingConnectionTarget;

        const cableType = this.modalForms.connCableType.value;
        const fibers = this.modalForms.connFibers.value;
        const sectionType = cableType === 'DROP' ? null : this.modalForms.connSectionType.value;

        // Add target as final point
        this.connectionWaypoints.push([targetNode.lat, targetNode.lng]);

        // Determine port info
        const fromPort = sourceNode.type === 'RACK' ? this.selectedSourcePort : null;
        const toPort = targetNode.type === 'RACK' ? this.selectedTargetPort : null;

        try {
            const conn = await this.inventoryManager.addConnection(
                sourceNode.id,
                targetNode.id,
                this.connectionWaypoints,
                cableType,
                fibers,
                fromPort,
                toPort,
                sectionType
            );

            if (conn) {
                this.mapManager.addConnection(conn);
                this.mapManager.refreshAllMarkers(this.inventoryManager); // Refresh to update connectivity status

                const distance = this.mapManager.calculateDistance(this.connectionWaypoints);
                // alert(`Conexión creada: ${sourceNode.name} -> ${targetNode.name}\nDistancia: ${distance.toFixed(2)}m\nTipo: ${cableType} (${fibers} hilos)`);

                this.closeModal('connection');
                this.cancelConnectionFlow();
                this.pendingConnectionTarget = null;
                this.selectedSourcePort = null;
                this.selectedTargetPort = null;
            }
        } catch (e) {
            console.error("Error creating connection:", e);
            alert("Error al crear la conexión.");
        }
    }


    cancelConnectionFlow() {
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionWaypoints = [];
        this.mapManager.clearTempPolyline();
        this.details.btnConnect.textContent = "🔗 Conectar";
        this.details.btnConnect.disabled = false;
        alert("Conexión finalizada.");
    }

    // --- Rack Management ---
    showRackView() {
        const node = this.inventoryManager.getNode(this.currentNodeId);
        if (!node) return;

        this.currentRackNodeId = this.currentNodeId;
        this.rackView.nodeName.textContent = `${node.name} (${node.type})`;
        this.renderRackList(node);
        this.switchView('rack');
    }

    renderRackList(node) {
        const container = this.rackView.list;
        container.innerHTML = '';

        if (!node.rack || node.rack.length === 0) {
            container.innerHTML = '<p class="empty-state">Rack vacío. Agrega equipos.</p>';
            return;
        }

        node.rack.forEach((equip) => {
            const item = document.createElement('div');
            item.className = 'nav-btn';
            item.style.cursor = 'default';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'flex-start';
            item.style.padding = '10px';
            item.style.position = 'relative';

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; margin-bottom:5px;">
                    <span style="font-weight:bold;">${equip.name}</span>
                    <span style="font-size:11px; background:#eee; padding:2px 5px; border-radius:3px;">${equip.type}</span>
                </div>
                <div style="font-size:12px; opacity:0.7; margin-bottom:8px;">${equip.totalPorts} Puertos</div>
                <div style="display:flex; gap:5px; width:100%;">
                    <button class="action-btn btn-ports" style="flex:2; font-size:11px; padding:5px;">Gestionar Puertos</button>
                    <button class="btn-secondary btn-edit" style="flex:1; font-size:11px; padding:5px;">✏️</button>
                    <button class="btn-danger btn-delete" style="flex:1; font-size:11px; padding:5px;">🗑️</button>
                </div>
            `;

            // Button handlers
            const btnPorts = item.querySelector('.btn-ports');
            btnPorts.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showPortView(equip.id);
            });

            const btnEdit = item.querySelector('.btn-edit');
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editEquipment(equip.id);
            });

            const btnDelete = item.querySelector('.btn-delete');
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteEquipment(equip.id);
            });

            container.appendChild(item);
        });
    }

    addEquipmentToRack() {
        this.showEquipmentModal();
    }

    async finalizeAddEquipment() {
        console.log('Finalizing Add Equipment...');
        console.log('Current Rack Node ID:', this.currentRackNodeId);

        try {
            const name = this.modalForms.equipName.value;
            const type = this.modalForms.equipType.value;
            const ports = this.modalForms.equipPorts.value;
            const isProvider = this.modalForms.equipIsProvider.checked;

            console.log('Equipment Data:', { name, type, ports, isProvider });

            if (!name || name.trim() === "") {
                alert("Por favor ingresa un nombre para el equipo.");
                return;
            }

            if (!this.currentRackNodeId) {
                console.error('No currentRackNodeId set!');
                alert("Error: No se ha seleccionado un rack. Por favor cierra y vuelve a abrir la vista del rack.");
                return;
            }

            const equipment = {
                id: Date.now().toString(),
                name: name,
                type: type,
                totalPorts: ports,
                isProvider: (type === 'ROUTER' && isProvider)
                // Note: ports array will be initialized by addEquipmentToRack
            };

            console.log('Adding equipment to rack:', equipment);

            // Add to inventory (this will initialize ports)
            await this.inventoryManager.addEquipmentToRack(this.currentRackNodeId, equipment);

            console.log('Equipment added successfully');

            // Get updated node and refresh view
            const updatedNode = this.inventoryManager.getNode(this.currentRackNodeId);
            console.log('Updated node:', updatedNode);

            this.renderRackList(updatedNode);

            this.closeModal('equipment');
            this.modalForms.equipment.reset();

            console.log('Equipment addition complete');
        } catch (e) {
            console.error("Error adding equipment:", e);
            alert("Ocurrió un error al guardar el equipo. Revisa la consola para más detalles.");
        }
    }

    editEquipment(equipmentId) {
        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        const equip = node.rack.find(e => e.id === equipmentId);
        if (!equip) return;

        const newName = prompt('Nombre del Equipo:', equip.name);
        if (!newName) return;

        const newType = prompt('Tipo (OLT, ODF, SWITCH, ROUTER, SERVER):', equip.type);
        if (!newType) return;

        const newPorts = prompt('Cantidad de Puertos:', equip.totalPorts);
        if (!newPorts) return;

        // Update equipment
        equip.name = newName;
        equip.type = newType;

        // If ports changed, rebuild port array
        const portsNum = parseInt(newPorts);
        if (portsNum !== parseInt(equip.totalPorts)) {
            equip.totalPorts = newPorts;
            equip.ports = [];
            for (let i = 1; i <= portsNum; i++) {
                equip.ports.push({
                    id: `${equip.id}-p${i}`,
                    number: i,
                    status: 'free',
                    connectedTo: null
                });
            }
        }

        this.inventoryManager.updateNode(node);
        this.renderRackList(node);
    }

    deleteEquipment(equipmentId) {
        if (!confirm('¿Estás seguro de eliminar este equipo? Se perderán todas las conexiones de puertos.')) return;

        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        node.rack = node.rack.filter(e => e.id !== equipmentId);
        this.inventoryManager.updateNode(node);
        this.renderRackList(node);
    }


    // --- Port Management ---
    showPortView(equipmentId) {
        this.currentEquipmentId = equipmentId;
        const equipment = this.inventoryManager.getEquipment(this.currentRackNodeId, equipmentId);
        if (!equipment) return;

        this.portView.title.textContent = equipment.name;
        this.portView.subtitle.textContent = `${equipment.type} - ${equipment.totalPorts} Puertos`;

        this.renderPortGrid(equipment);
        this.switchView('ports');
    }

    renderPortGrid(equipment) {
        const container = this.portView.grid;
        container.innerHTML = '';

        equipment.ports.forEach(port => {
            const portEl = document.createElement('div');
            portEl.className = 'port-item';
            portEl.style.position = 'relative';
            portEl.textContent = port.number;

            // Warning icon for reported ports
            if (port.reported) {
                const warning = document.createElement('div');
                warning.innerHTML = '⚠️';
                warning.style.position = 'absolute';
                warning.style.top = '-5px';
                warning.style.right = '-5px';
                warning.style.fontSize = '10px';
                portEl.appendChild(warning);
            }

            // Styling based on status
            if (port.status === 'connected') {
                portEl.style.backgroundColor = port.reported ? '#e74c3c' : '#2ecc71';
                portEl.style.color = 'white';
                portEl.title = `Conectado a: ${port.connectedTo.equipName} (P${port.connectedTo.portId.split('-p')[1]})`;
                if (port.reported) portEl.title += ' - REPORTADO';
            } else {
                portEl.style.backgroundColor = '#eee';
            }

            portEl.addEventListener('click', () => this.openPatchingModal(equipment.id, port.id));
            container.appendChild(portEl);
        });
    }

    // --- Patching Wizard Logic ---
    openPatchingModal(equipId, portId) {
        this.wizardState.sourceEquipId = equipId;
        this.wizardState.sourcePortId = portId;
        this.wizardState.targetEquipId = null;

        const equipment = this.inventoryManager.getEquipment(this.currentRackNodeId, equipId);
        const port = equipment.ports.find(p => p.id === portId);

        this.patchingUI.title.textContent = `Gestionar Puerto ${port.number} (${equipment.name})`;

        if (port.status === 'connected') {
            const statusColor = port.reported ? 'red' : 'green';
            const statusText = port.reported ? 'Conectado - REPORTADO' : 'Conectado';
            this.patchingUI.portInfo.innerHTML = `Estado: <span style="color:${statusColor}">${statusText}</span><br>Destino: ${port.connectedTo.equipName}`;
            this.patchingUI.btnConnect.classList.add('hidden');
            this.patchingUI.btnDisconnect.classList.remove('hidden');

            // Add report/resolve button
            if (port.reported) {
                this.patchingUI.btnDisconnect.textContent = 'Desconectar';
                // Add resolve button if not exists
                let resolveBtn = document.getElementById('btn-patch-resolve');
                if (!resolveBtn) {
                    resolveBtn = document.createElement('button');
                    resolveBtn.id = 'btn-patch-resolve';
                    resolveBtn.className = 'action-btn';
                    resolveBtn.style.backgroundColor = '#27ae60';
                    resolveBtn.textContent = '✔️ Resolver Reporte';
                    resolveBtn.addEventListener('click', () => this.resolvePortReport());
                    this.patchingUI.step1.querySelector('div').appendChild(resolveBtn);
                } else {
                    resolveBtn.classList.remove('hidden');
                }
                const reportBtn = document.getElementById('btn-patch-report');
                if (reportBtn) reportBtn.classList.add('hidden');
            } else {
                this.patchingUI.btnDisconnect.textContent = 'Desconectar';
                // Add report button if not exists
                let reportBtn = document.getElementById('btn-patch-report');
                if (!reportBtn) {
                    reportBtn = document.createElement('button');
                    reportBtn.id = 'btn-patch-report';
                    reportBtn.className = 'btn-danger';
                    reportBtn.textContent = '⚠️ Reportar Falla';
                    reportBtn.addEventListener('click', () => this.reportPortFailure());
                    this.patchingUI.step1.querySelector('div').appendChild(reportBtn);
                } else {
                    reportBtn.classList.remove('hidden');
                }

                const resolveBtn = document.getElementById('btn-patch-resolve');
                if (resolveBtn) resolveBtn.classList.add('hidden');
            }
        } else {
            this.patchingUI.portInfo.innerHTML = `Estado: <span style="color:grey">Libre</span>`;
            this.patchingUI.btnConnect.classList.remove('hidden');
            this.patchingUI.btnDisconnect.classList.add('hidden');

            // Hide report/resolve buttons
            const reportBtn = document.getElementById('btn-patch-report');
            const resolveBtn = document.getElementById('btn-patch-resolve');
            if (reportBtn) reportBtn.classList.add('hidden');
            if (resolveBtn) resolveBtn.classList.add('hidden');
        }

        this.patchingUI.modal.classList.remove('hidden');
        this.wizardGoToStep1();
    }

    closePatchingModal() {
        this.patchingUI.modal.classList.add('hidden');
        // Refresh port grid to show changes
        if (this.currentEquipmentId) {
            this.showPortView(this.currentEquipmentId);
        }
    }

    wizardGoToStep1() {
        this.patchingUI.step1.classList.remove('hidden');
        this.patchingUI.step2.classList.add('hidden');
        this.patchingUI.step3.classList.add('hidden');
    }

    wizardGoToStep2() {
        // List available equipment (excluding source)
        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        const others = node.rack.filter(e => e.id !== this.wizardState.sourceEquipId);

        const list = this.patchingUI.equipList;
        list.innerHTML = '';

        if (others.length === 0) {
            list.innerHTML = '<p style="padding:10px; color:#666">No hay otros equipos en el rack.</p>';
        } else {
            others.forEach(eq => {
                const item = document.createElement('div');
                item.className = 'nav-btn';
                item.style.borderBottom = '1px solid #eee';
                item.textContent = `${eq.name} (${eq.type})`;
                item.addEventListener('click', () => {
                    this.wizardState.targetEquipId = eq.id;
                    this.wizardGoToStep3();
                });
                list.appendChild(item);
            });
        }

        this.patchingUI.step1.classList.add('hidden');
        this.patchingUI.step2.classList.remove('hidden');
        this.patchingUI.step3.classList.add('hidden');
    }

    wizardGoToStep3() {
        // List ports of target equipment
        const targetEquip = this.inventoryManager.getEquipment(this.currentRackNodeId, this.wizardState.targetEquipId);
        const grid = this.patchingUI.portList;
        grid.innerHTML = '';

        targetEquip.ports.forEach(port => {
            const btn = document.createElement('div');
            btn.className = 'port-item';
            btn.textContent = port.number;

            if (port.status === 'connected') {
                btn.style.backgroundColor = '#ccc';
                btn.style.cursor = 'not-allowed';
                btn.title = 'Ocupado';
            } else {
                btn.style.backgroundColor = '#eee';
                btn.addEventListener('click', async () => await this.executeConnection(port.id));
            }
            grid.appendChild(btn);
        });

        this.patchingUI.step2.classList.add('hidden');
        this.patchingUI.step3.classList.remove('hidden');
    }

    async executeConnection(targetPortId) {
        const success = await this.inventoryManager.patchPorts(
            this.currentRackNodeId,
            this.wizardState.sourceEquipId,
            this.wizardState.sourcePortId,
            this.wizardState.targetEquipId,
            targetPortId
        );

        if (success) {
            alert("¡Conexión realizada con éxito!");
            this.closePatchingModal();
        } else {
            alert("Error al conectar.");
        }
    }

    async disconnectPort() {
        // Simplified disconnect logic (needs backend support in InventoryManager, adding it here)
        // For now, just alert as placeholder or implement basic disconnect
        // Since InventoryManager.patchPorts handles connection, we need a disconnect method.
        // I'll implement a basic disconnect here by manually updating the node data for now, 
        // but ideally InventoryManager should handle it.

        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        const equip = node.rack.find(e => e.id === this.wizardState.sourceEquipId);
        const port = equip.ports.find(p => p.id === this.wizardState.sourcePortId);

        if (port && port.status === 'connected') {
            const targetInfo = port.connectedTo;

            // Disconnect source
            port.status = 'free';
            port.connectedTo = null;
            port.reported = false; // Also clear reported status on disconnect

            // Disconnect target
            const targetEquip = node.rack.find(e => e.id === targetInfo.equipId);
            if (targetEquip) {
                const targetPort = targetEquip.ports.find(p => p.id === targetInfo.portId);
                if (targetPort) {
                    targetPort.status = 'free';
                    targetPort.connectedTo = null;
                    targetPort.reported = false; // Also clear reported status on disconnect
                }
            }

            await this.inventoryManager.updateNode(node);
            alert("Puerto desconectado.");
            this.closePatchingModal();
        }
    }

    // --- Connection Management ---
    showConnectionDetails(connectionId) {
        const connection = this.inventoryManager.getConnections().find(c => c.id === connectionId);
        if (!connection) return;

        this.currentConnectionId = connectionId;

        const fromNode = this.inventoryManager.getNode(connection.from);
        const toNode = this.inventoryManager.getNode(connection.to);

        this.connectionDetails.fromName.textContent = fromNode ? fromNode.name : '--';
        this.connectionDetails.toName.textContent = toNode ? toNode.name : '--';
        this.connectionDetails.cableType.textContent = connection.cableType || '--';

        if (connection.cableType === 'DROP') {
            this.connectionDetails.sectionTypeRow.classList.add('hidden');
        } else {
            this.connectionDetails.sectionTypeRow.classList.remove('hidden');
            this.connectionDetails.sectionType.textContent = connection.sectionType || 'No definido';
        }

        this.connectionDetails.fibers.textContent = connection.fibers || '--';

        const distance = this.mapManager.calculateDistance(connection.path);
        this.connectionDetails.distance.textContent = distance.toFixed(2);

        this.switchView('connection');
    }

    editConnection() {
        if (!this.currentConnectionId) return;

        const connection = this.inventoryManager.getConnections().find(c => c.id === this.currentConnectionId);
        if (!connection) return;

        // Show modal with current values
        this.modalForms.connCableType.value = connection.cableType || 'ADSS';
        this.modalForms.connFibers.value = connection.fibers || '12';

        // Temporarily store connection for editing
        this.editingConnectionId = this.currentConnectionId;

        this.modals.connection.classList.remove('hidden');

        // Override form submit for editing
        const originalHandler = this.modalForms.connection.onsubmit;
        this.modalForms.connection.onsubmit = (e) => {
            e.preventDefault();
            this.finalizeEditConnection();
        };
    }

    async finalizeEditConnection() {
        if (!this.editingConnectionId) return;

        const connections = this.inventoryManager.getConnections();
        const connection = connections.find(c => c.id === this.editingConnectionId);

        if (connection) {
            connection.cableType = this.modalForms.connCableType.value;
            connection.fibers = this.modalForms.connFibers.value;

            await this.inventoryManager.updateConnection(connection);

            // Refresh map
            this.mapManager.removeConnection(connection.id);
            this.mapManager.addConnection(connection);

            this.closeModal('connection');
            this.showConnectionDetails(this.editingConnectionId);
            this.editingConnectionId = null;

            // Restore original handler
            this.modalForms.connection.onsubmit = (e) => {
                e.preventDefault();
                this.finalizeConnection();
            };
        }
    }

    async deleteConnection() {
        if (this.currentConnectionId) {
            if (confirm('¿Estás seguro de eliminar esta conexión?')) {
                await this.inventoryManager.deleteConnection(this.currentConnectionId);
                this.mapManager.removeConnection(this.currentConnectionId);
                this.mapManager.refreshAllMarkers(this.inventoryManager); // Refresh to update connectivity status
                this.switchView('list');
                this.currentConnectionId = null;
            }
        }
    }

    refreshAllMarkers() {
        const nodes = this.inventoryManager.getNodes();
        nodes.forEach(node => {
            this.mapManager.addMarker(node);
        });
    }

    reportPortFailure() {
        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        const equip = node.rack.find(e => e.id === this.wizardState.sourceEquipId);
        const port = equip.ports.find(p => p.id === this.wizardState.sourcePortId);

        if (port && port.status === 'connected') {
            port.reported = true;

            // Mark connected port as reported too
            const targetEquip = node.rack.find(e => e.id === port.connectedTo.equipId);
            if (targetEquip) {
                const targetPort = targetEquip.ports.find(p => p.id === port.connectedTo.portId);
                if (targetPort) {
                    targetPort.reported = true;
                }
            }

            this.inventoryManager.updateNode(node);

            // Update all affected downstream nodes
            this.propagatePortFailure(this.currentRackNodeId, port);

            alert('Falla reportada. Los nodos afectados mostrarán el indicador de advertencia.');
            this.closePatchingModal();
        }
    }

    resolvePortReport() {
        const node = this.inventoryManager.getNode(this.currentRackNodeId);
        const equip = node.rack.find(e => e.id === this.wizardState.sourceEquipId);
        const port = equip.ports.find(p => p.id === this.wizardState.sourcePortId);

        if (port && port.reported) {
            port.reported = false;

            // Resolve connected port too
            const targetEquip = node.rack.find(e => e.id === port.connectedTo.equipId);
            if (targetEquip) {
                const targetPort = targetEquip.ports.find(p => p.id === port.connectedTo.portId);
                if (targetPort) {
                    targetPort.reported = false;
                }
            }

            this.inventoryManager.updateNode(node);

            // Refresh all markers
            this.refreshAllMarkers();

            alert('Reporte resuelto. Los indicadores de advertencia se han actualizado.');
            this.closePatchingModal();
        }
    }

    propagatePortFailure(rackNodeId, failedPort) {
        // Find all external connections from this rack that use the failed port
        const connections = this.inventoryManager.getConnections();
        const affectedConnections = connections.filter(c => {
            if (c.from === rackNodeId && c.fromPort) {
                return c.fromPort.portId === failedPort.id;
            }
            if (c.to === rackNodeId && c.toPort) {
                return c.toPort.portId === failedPort.id;
            }
            return false;
        });

        // For each affected connection, get downstream nodes
        affectedConnections.forEach(conn => {
            const startNode = conn.from === rackNodeId ? conn.to : conn.from;
            this.markDownstreamAsAffected(startNode);
        });

        // Refresh all markers
        this.refreshAllMarkers();
    }

    markDownstreamAsAffected(startNodeId) {
        const impact = this.inventoryManager.getDownstreamImpact(startNodeId);
        // The visual update will happen automatically through hasNodeConnections check
        // which now considers reported ports
    }

    // --- Damage Report Logic ---
    async reportDamage() {
        if (!this.currentNodeId) return;

        const node = this.inventoryManager.getNode(this.currentNodeId);
        if (!node) return;

        // Prompt for damage description
        const description = prompt('Describe el daño o problema encontrado:');
        if (!description || description.trim() === '') {
            alert('Debe ingresar una descripción del daño.');
            return;
        }

        // Create damage report
        const damageReport = {
            id: Date.now().toString(),
            description: description.trim(),
            resolved: false,
            reportedAt: new Date().toISOString()
        };

        // Initialize damageReports array if it doesn't exist
        if (!node.damageReports) {
            node.damageReports = [];
        }

        // Add the report
        node.damageReports.push(damageReport);

        // Update node in database
        await this.inventoryManager.updateNode(node);

        // Calculate downstream impact
        const impact = this.inventoryManager.getDownstreamImpact(this.currentNodeId);

        // Refresh node details to show the new report first
        this.showNodeDetails(this.currentNodeId);

        // Then highlight on map
        this.mapManager.resetNetworkStyles();
        this.mapManager.highlightAffectedNetwork(
            impact.nodes.map(n => n.id),
            impact.connectionIds
        );

        // Show results in sidebar
        this.details.reportResults.classList.remove('hidden');
        this.details.impactSummary.textContent = `Reporte creado. ${impact.nodes.length} equipos afectados aguas abajo.`;

        this.details.impactList.innerHTML = '';
        if (impact.nodes.length > 0) {
            impact.nodes.forEach(node => {
                const li = document.createElement('li');
                li.textContent = `${node.name} (${node.type})`;
                this.details.impactList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = "No hay equipos dependientes afectados.";
            this.details.impactList.appendChild(li);
        }

        alert(`Reporte de daño creado exitosamente.\nID: ${damageReport.id}\nEquipos afectados: ${impact.nodes.length}`);
    }

    async resolveReport(nodeId, reportId) {
        const node = this.inventoryManager.getNode(nodeId);
        if (!node || !node.damageReports) return;

        const report = node.damageReports.find(r => r.id === reportId);
        if (!report) return;

        // Mark as resolved
        report.resolved = true;
        report.resolvedAt = new Date().toISOString();

        // Calculate resolution time
        const reportedTime = new Date(report.reportedAt);
        const resolvedTime = new Date(report.resolvedAt);
        const diffMs = resolvedTime - reportedTime;

        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        report.resolutionTime = `${days}d ${hours}h ${minutes}m`;

        // Update node in database
        await this.inventoryManager.updateNode(node);

        // Refresh the view
        this.showNodeDetails(nodeId);

        alert(`Reporte marcado como resuelto.\nTiempo de resolución: ${report.resolutionTime}`);
    }

    showAllReports(nodeId) {
        const node = this.inventoryManager.getNode(nodeId);
        if (!node || !node.damageReports) return;

        let html = '<div style="max-height: 400px; overflow-y: auto;">';
        html += '<h3 style="margin-top: 0;">Historial de Reportes</h3>';

        // Sort by date, newest first
        const sortedReports = [...node.damageReports].sort((a, b) =>
            new Date(b.reportedAt) - new Date(a.reportedAt)
        );

        sortedReports.forEach(report => {
            const reportDate = new Date(report.reportedAt).toLocaleString('es-CO');
            const statusColor = report.resolved ? '#28a745' : '#dc3545';
            const statusText = report.resolved ? '✓ Resuelto' : '✗ Pendiente';

            html += `
                <div style="margin-bottom: 15px; padding: 10px; background: white; border-left: 3px solid ${statusColor}; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="font-size: 12px; color: #666;">ID: ${report.id}</strong>
                        <span style="font-size: 12px; color: ${statusColor}; font-weight: bold;">${statusText}</span>
                    </div>
                    <p style="margin: 5px 0; font-size: 14px; color: #333;">${report.description}</p>
                    <small style="color: #666; font-size: 11px;">Reportado: ${reportDate}</small>
            `;

            if (report.resolved && report.resolvedAt) {
                const resolvedDate = new Date(report.resolvedAt).toLocaleString('es-CO');
                html += `<br><small style="color: #28a745; font-size: 11px;">Resuelto: ${resolvedDate}</small>`;
                if (report.resolutionTime) {
                    html += `<br><small style="color: #666; font-size: 11px;">Tiempo de resolución: ${report.resolutionTime}</small>`;
                }
            } else {
                html += `<br><button class="btn-secondary" style="margin-top: 8px; font-size: 11px; padding: 4px 8px;" onclick="window.uiManager.resolveReport('${nodeId}', '${report.id}'); window.uiManager.closeReportsModal();">Marcar como Resuelto</button>`;
            }

            html += '</div>';
        });

        html += '</div>';
        html += '<button class="action-btn" style="width: 100%; margin-top: 10px;" onclick="window.uiManager.closeReportsModal()">Cerrar</button>';

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'modal-all-reports';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-content" style="max-width: 600px;">${html}</div>`;
        document.body.appendChild(modal);
        modal.classList.remove('hidden');
    }

    closeReportsModal() {
        const modal = document.getElementById('modal-all-reports');
        if (modal) {
            modal.remove();
        }
        // Refresh current node details
        if (this.currentNodeId) {
            this.showNodeDetails(this.currentNodeId);
        }
    }

    // --- Details & List ---
    showNodeDetails(nodeId) {
        const node = this.inventoryManager.getNode(nodeId);
        if (!node) return;

        this.currentNodeId = nodeId;
        this.details.name.textContent = node.name;
        this.details.type.textContent = node.type;
        this.details.coords.textContent = `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`;
        this.details.type.style.backgroundColor = this.mapManager.getColorForType(node.type);

        // Show extra info for ONUs
        if (node.type === 'ONU' && node.clientData) {
            this.details.extraInfo.innerHTML = `
                <p><strong>Cliente:</strong> ${node.clientData.address}</p>
                <p><strong>Plan:</strong> ${node.clientData.plan}</p>
            `;
        } else {
            this.details.extraInfo.innerHTML = '';
        }

        // Show damage reports
        let damageReportsHtml = '';
        if (node.damageReports && node.damageReports.length > 0) {
            // Separate pending and resolved reports
            const pendingReports = node.damageReports.filter(r => !r.resolved);
            const resolvedReports = node.damageReports.filter(r => r.resolved);

            // Combine: show pending first, then resolved (max 3 total)
            const reportsToShow = [
                ...pendingReports.slice(0, 3),
                ...resolvedReports.slice(0, Math.max(0, 3 - pendingReports.length))
            ];

            if (reportsToShow.length > 0) {
                const hasPending = pendingReports.length > 0;
                const bgColor = hasPending ? '#fff3cd' : '#d4edda';
                const borderColor = hasPending ? '#ffc107' : '#28a745';
                const titleColor = hasPending ? '#856404' : '#155724';
                const title = hasPending ? '⚠️ Reportes de Daños' : '✓ Reportes Resueltos';

                damageReportsHtml = `<div style="margin-top: 15px; padding: 10px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 4px;">`;
                damageReportsHtml += `<h4 style="margin: 0 0 10px 0; color: ${titleColor};">${title}</h4>`;

                reportsToShow.forEach((report) => {
                    const reportDate = new Date(report.reportedAt).toLocaleString('es-CO');
                    const statusColor = report.resolved ? '#28a745' : '#dc3545';
                    const statusText = report.resolved ? '✓ Resuelto' : '✗ Pendiente';

                    damageReportsHtml += `
                        <div style="margin-bottom: 10px; padding: 8px; background: white; border-left: 3px solid ${statusColor}; border-radius: 3px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <strong style="font-size: 11px; color: #666;">ID: ${report.id}</strong>
                                <span style="font-size: 11px; color: ${statusColor}; font-weight: bold;">${statusText}</span>
                            </div>
                            <p style="margin: 5px 0; font-size: 13px;">${report.description}</p>
                            <small style="color: #666; font-size: 11px;">Reportado: ${reportDate}</small>
                    `;

                    if (report.resolved && report.resolvedAt) {
                        const resolvedDate = new Date(report.resolvedAt).toLocaleString('es-CO');
                        damageReportsHtml += `<br><small style="color: #28a745; font-size: 11px;">Resuelto: ${resolvedDate}</small>`;
                        if (report.resolutionTime) {
                            damageReportsHtml += `<br><small style="color: #666; font-size: 11px;">Tiempo: ${report.resolutionTime}</small>`;
                        }
                    } else {
                        damageReportsHtml += `<br><button class="btn-secondary" style="margin-top: 5px; font-size: 11px; padding: 4px 8px;" onclick="window.uiManager.resolveReport('${nodeId}', '${report.id}')">Marcar como Resuelto</button>`;
                    }

                    damageReportsHtml += '</div>';
                });

                // Show "View All" button if there are more than 3 reports total
                if (node.damageReports.length > 3) {
                    damageReportsHtml += `
                        <button class="btn-secondary" style="width: 100%; margin-top: 5px; font-size: 12px;" onclick="window.uiManager.showAllReports('${nodeId}')">
                            Ver Historial Completo (${node.damageReports.length} reportes)
                        </button>
                    `;
                }

                damageReportsHtml += '</div>';
            }
        }

        this.details.damageReportsSection.innerHTML = damageReportsHtml;

        // Show/Hide Rack Button only for RACK type
        if (node.type === 'RACK') {
            this.details.btnViewRack.classList.remove('hidden');
        } else {
            this.details.btnViewRack.classList.add('hidden');
        }

        // Show/Hide Splitter Button for MUFLA type
        let btnViewSplitters = document.getElementById('btn-view-splitters');
        if (!btnViewSplitters) {
            btnViewSplitters = document.createElement('button');
            btnViewSplitters.id = 'btn-view-splitters';
            btnViewSplitters.className = 'action-btn';
            btnViewSplitters.textContent = '🔌 Ver Splitters';
            btnViewSplitters.style.marginTop = '10px';
            btnViewSplitters.addEventListener('click', () => this.showSplitterView());
            this.details.btnViewRack.parentNode.insertBefore(btnViewSplitters, this.details.btnViewRack.nextSibling);
        }

        if (node.type === 'MUFLA' || node.type === 'NAP') {
            btnViewSplitters.classList.remove('hidden');
        } else {
            btnViewSplitters.classList.add('hidden');
        }

        // Hide previous reports
        this.details.reportResults.classList.add('hidden');
        this.mapManager.resetNetworkStyles();

        this.switchView('details');
    }

    async deleteCurrentNode() {
        if (this.currentNodeId) {
            // Remove connections first visually
            const connections = this.inventoryManager.getConnections();
            connections.forEach(c => {
                if (c.from === this.currentNodeId || c.to === this.currentNodeId) {
                    this.mapManager.removeConnection(c.id);
                }
            });

            await this.inventoryManager.deleteNode(this.currentNodeId);
            this.mapManager.removeMarker(this.currentNodeId);
            this.switchView('list');
            this.refreshNodeList();
            this.currentNodeId = null;
        }
    }

    // --- Splitter Management ---
    showSplitterView() {
        if (!this.currentNodeId) return;
        this.currentSplitterNodeId = this.currentNodeId;
        const node = this.inventoryManager.getNode(this.currentNodeId);

        this.splitterView.nodeName.textContent = node.name;
        this.renderSplitterList(node);
        this.switchView('splitter');
    }

    renderSplitterList(node) {
        const container = this.splitterView.list;
        container.innerHTML = '';

        if (!node.splitters || node.splitters.length === 0) {
            container.innerHTML = '<p class="empty-state">Sin splitters.</p>';
            return;
        }

        node.splitters.forEach(splitter => {
            const item = document.createElement('div');
            item.className = 'nav-btn';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '10px';
            item.style.marginBottom = '5px';
            item.style.border = '1px solid #eee';
            item.style.borderRadius = '4px';

            const info = document.createElement('div');
            const inputInfo = splitter.inputFiber ?
                `<span style="color:${splitter.inputFiber.color}">●</span> Hilo ${splitter.inputFiber.fiberNumber}` :
                'Sin entrada';

            info.innerHTML = `
                <strong>Splitter ${splitter.type}</strong><br>
                <span style="font-size:12px; color:#666">Entrada: ${inputInfo}</span>
            `;

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '5px';

            const btnPorts = document.createElement('button');
            btnPorts.className = 'btn-secondary';
            btnPorts.textContent = 'Puertos';
            btnPorts.style.padding = '4px 8px';
            btnPorts.style.fontSize = '12px';
            btnPorts.onclick = (e) => {
                e.stopPropagation();
                this.showSplitterPorts(splitter.id);
            };

            const btnDelete = document.createElement('button');
            btnDelete.className = 'btn-danger';
            btnDelete.textContent = '🗑️';
            btnDelete.style.padding = '4px 8px';
            btnDelete.style.fontSize = '12px';
            btnDelete.title = 'Eliminar Splitter';
            btnDelete.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('¿Estás seguro de eliminar este splitter? Se desconectarán todos los hilos.')) return;

                // Free input fiber - clear correct termination
                const conn = this.inventoryManager.getConnections().find(c => c.id === splitter.inputFiber.connectionId);
                if (conn) {
                    const fiber = conn.fiberDetails.find(f => f.number === splitter.inputFiber.fiberNumber);
                    if (fiber) {
                        const isFromNode = conn.from === this.currentSplitterNodeId;
                        if (isFromNode) {
                            fiber.fromTermination = null;
                        } else {
                            fiber.toTermination = null;
                        }
                    }
                    await this.inventoryManager.updateConnection(conn);
                }

                await this.inventoryManager.deleteSplitter(this.currentSplitterNodeId, splitter.id);
                this.renderSplitterList(this.inventoryManager.getNode(this.currentSplitterNodeId));
            };

            buttonContainer.appendChild(btnPorts);
            buttonContainer.appendChild(btnDelete);

            item.appendChild(info);
            item.appendChild(buttonContainer);
            container.appendChild(item);
        });
    }

    openAddSplitterModal() {
        // Populate input connections
        const select = this.splitterModals.inputConnection;
        select.innerHTML = '<option value="">Seleccionar cable...</option>';

        const connections = this.inventoryManager.getConnections().filter(c =>
            c.from === this.currentSplitterNodeId || c.to === this.currentSplitterNodeId
        );

        connections.forEach(conn => {
            const otherNodeId = conn.from === this.currentSplitterNodeId ? conn.to : conn.from;
            const otherNode = this.inventoryManager.getNode(otherNodeId);
            const option = document.createElement('option');
            option.value = conn.id;
            option.textContent = `${conn.cableType} (${conn.fibers}h) -> ${otherNode.name}`;
            select.appendChild(option);
        });

        this.splitterModals.fiberSelection.classList.add('hidden');
        this.splitterModals.addSplitter.classList.remove('hidden');
    }

    handleSplitterInputConnectionChange() {
        const connId = this.splitterModals.inputConnection.value;
        if (!connId) {
            this.splitterModals.fiberSelection.classList.add('hidden');
            return;
        }

        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);
        const grid = this.splitterModals.fiberGrid;
        grid.innerHTML = '';

        if (connection && connection.fiberDetails) {
            // Determine direction relative to current node
            const isFromNode = connection.from === this.currentSplitterNodeId;

            connection.fiberDetails.forEach(fiber => {
                const item = document.createElement('div');

                // Check termination at current node
                const currentTermination = isFromNode ? fiber.fromTermination : fiber.toTermination;

                // Can use as input if:
                // 1. Termination is null (completely free)
                // 2. OR Termination exists but is generic (nodeId matches current node, but no splitter/equip/port assigned yet)
                //    This happens when we connected a splitter output from the other end to this node "directly"
                let canUseAsInput = !currentTermination;

                if (currentTermination) {
                    // Check if it's a generic termination at this node (ready to be used as input)
                    if (currentTermination.nodeId === this.currentSplitterNodeId &&
                        !currentTermination.splitterId &&
                        !currentTermination.equipId) {
                        canUseAsInput = true;
                    }
                }

                item.className = `fiber-item ${!canUseAsInput ? 'used' : ''}`;
                item.innerHTML = `
                    <div class="fiber-color ${fiber.color.toLowerCase()}"></div>
                    <span>Hilo ${fiber.number}</span>
                `;

                if (canUseAsInput) {
                    item.onclick = () => {
                        // Deselect others
                        grid.querySelectorAll('.fiber-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                        this.selectedFiber = fiber;
                    };
                }

                grid.appendChild(item);
            });
            this.splitterModals.fiberSelection.classList.remove('hidden');
        }
    }

    async finalizeAddSplitter() {
        const type = this.splitterModals.splitterType.value;
        const connId = this.splitterModals.inputConnection.value;

        if (!connId || !this.selectedFiber) {
            alert('Debes seleccionar un cable y un hilo de entrada.');
            return;
        }

        const splitter = {
            id: Date.now().toString(),
            type: type,
            inputFiber: {
                connectionId: connId,
                fiberNumber: this.selectedFiber.number,
                color: this.selectedFiber.color
            }
        };

        // Mark fiber termination (input to splitter)
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);
        const fiber = connection.fiberDetails.find(f => f.number === this.selectedFiber.number);
        const isFromNode = connection.from === this.currentSplitterNodeId;

        const terminationData = {
            nodeId: this.currentSplitterNodeId,
            splitterId: splitter.id,
            port: 'input'
        };

        if (isFromNode) {
            fiber.fromTermination = terminationData;
        } else {
            fiber.toTermination = terminationData;
        }

        await this.inventoryManager.updateConnection(connection);

        const addedSplitter = await this.inventoryManager.addSplitterToNode(this.currentSplitterNodeId, splitter);

        if (addedSplitter) {
            this.splitterModals.addSplitter.classList.add('hidden');
            this.renderSplitterList(this.inventoryManager.getNode(this.currentSplitterNodeId));
            this.selectedFiber = null;
        }
    }

    showSplitterPorts(splitterId) {
        this.currentSplitterId = splitterId;
        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, splitterId);
        const currentNode = this.inventoryManager.getNode(this.currentSplitterNodeId);

        // Update splitter type display
        this.splitterModals.splitterTypeDisplay.textContent = `SPLITTER ${splitter.type}`;

        // Update input fiber with color indicator
        const inputColorHex = splitter.inputFiber.colorHex || this.inventoryManager.getColorHex(splitter.inputFiber.color);
        const inputFiberHtml = `
            <span style="display: inline-block; width: 12px; height: 12px; background: ${inputColorHex}; border-radius: 50%; margin-right: 8px; border: 2px solid #333;"></span>
            Hilo ${splitter.inputFiber.fiberNumber} (${splitter.inputFiber.color})
        `;
        this.splitterModals.inputFiber.innerHTML = inputFiberHtml;
        this.splitterModals.inputFiber.style.borderColor = inputColorHex;

        // Render output ports with connection info
        const list = this.splitterModals.outputList;
        list.innerHTML = '';

        splitter.outputPorts.forEach(port => {
            const portItem = document.createElement('div');
            portItem.style.cssText = 'padding: 10px; background: white; border: 2px solid #ddd; border-radius: 6px; cursor: pointer; transition: all 0.2s;';

            // Get the color of this splitter port based on its number (TIA-598)
            const colorMap = [
                { name: 'Azul', hex: '#0066CC' },       // 1
                { name: 'Naranja', hex: '#FF8800' },    // 2
                { name: 'Verde', hex: '#00AA00' },      // 3
                { name: 'Café', hex: '#8B4513' },       // 4
                { name: 'Gris', hex: '#808080' },       // 5
                { name: 'Blanco', hex: '#FFFFFF' },     // 6
                { name: 'Rojo', hex: '#FF0000' },       // 7
                { name: 'Negro', hex: '#000000' },      // 8
                { name: 'Amarillo', hex: '#FFFF00' },   // 9
                { name: 'Violeta', hex: '#8B00FF' },    // 10
                { name: 'Rosa', hex: '#FF69B4' },       // 11
                { name: 'Verde Agua', hex: '#00CED1' }  // 12
            ];

            const portColorInfo = colorMap[(port.portNumber - 1) % colorMap.length];
            const portColorHex = portColorInfo.hex;  // Color del puerto del splitter

            let connectionInfo = 'Libre';
            let fiberColorHex = '#ccc';  // Color del hilo de la fibra conectada
            let borderColor = '#ddd';    // Por defecto gris si está libre


            if (port.used && port.connectedTo) {
                // Get connection and fiber info
                const conn = this.inventoryManager.getConnections().find(c => c.id === port.connectedTo.connectionId);
                if (conn) {
                    const fiber = conn.fiberDetails.find(f => f.number === port.connectedTo.fiberNumber);
                    if (fiber) {
                        // El círculo tiene el color del hilo de la fibra
                        fiberColorHex = fiber.colorHex || this.inventoryManager.getColorHex(fiber.color);

                        // El borde tiene el color del puerto del splitter
                        borderColor = portColorHex;

                        if (fiber.toTermination) {
                            const destNode = this.inventoryManager.getNode(fiber.toTermination.nodeId);
                            if (destNode) {
                                connectionInfo = destNode.name;
                            }
                        }
                    }
                }
            }

            // Special styling for white fibers for better visibility
            let dotBorder = '#333';
            if (fiberColorHex === '#FFFFFF') {
                dotBorder = '#999';
            }

            portItem.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-weight: bold; font-size: 14px;">Puerto ${port.portNumber}</div>
                    <div style="width: 12px; height: 12px; background: ${fiberColorHex}; border-radius: 50%; border: 2px solid ${dotBorder};"></div>
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 4px;">${connectionInfo}</div>
            `;

            portItem.style.borderColor = borderColor;

            if (port.used) {
                portItem.style.background = '#f0f9ff';
            }

            portItem.onmouseover = () => portItem.style.transform = 'scale(1.02)';
            portItem.onmouseout = () => portItem.style.transform = 'scale(1)';
            portItem.onclick = () => this.openFiberConnectionModal(port);

            list.appendChild(portItem);
        });

        this.splitterModals.splitterPorts.classList.remove('hidden');
    }

    async deleteSplitter() {
        if (!confirm('¿Estás seguro de eliminar este splitter? Se desconectarán todos los hilos.')) return;

        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, this.currentSplitterId);

        // Free input fiber - clear correct termination
        const conn = this.inventoryManager.getConnections().find(c => c.id === splitter.inputFiber.connectionId);
        if (conn) {
            const fiber = conn.fiberDetails.find(f => f.number === splitter.inputFiber.fiberNumber);
            if (fiber) {
                const isFromNode = conn.from === this.currentSplitterNodeId;
                if (isFromNode) {
                    fiber.fromTermination = null;
                } else {
                    fiber.toTermination = null;
                }
            }
            await this.inventoryManager.updateConnection(conn);
        }

        // Free output connections (TODO: Implement logic to free downstream fibers)

        await this.inventoryManager.deleteSplitter(this.currentSplitterNodeId, this.currentSplitterId);

        this.splitterModals.splitterPorts.classList.add('hidden');
        this.renderSplitterList(this.inventoryManager.getNode(this.currentSplitterNodeId));
    }

    openFiberConnectionModal(port) {
        this.selectedSplitterPort = port;
        this.splitterModals.fiberConnPort.textContent = port.portNumber;

        // Populate destination nodes (only connected via cables)
        const select = this.splitterModals.fiberDestNode;
        select.innerHTML = '<option value="">Seleccionar nodo...</option>';

        const connections = this.inventoryManager.getConnections().filter(c =>
            c.from === this.currentSplitterNodeId || c.to === this.currentSplitterNodeId
        );

        connections.forEach(conn => {
            const otherNodeId = conn.from === this.currentSplitterNodeId ? conn.to : conn.from;
            const otherNode = this.inventoryManager.getNode(otherNodeId);
            const option = document.createElement('option');
            option.value = JSON.stringify({ nodeId: otherNodeId, connId: conn.id });
            option.textContent = `${otherNode.name} (${conn.cableType})`;
            select.appendChild(option);
        });

        this.fiberConnGoToStep1();
        this.splitterModals.fiberConnection.classList.remove('hidden');
    }

    handleFiberDestNodeChange() {
        const val = this.splitterModals.fiberDestNode.value;
        const group = this.splitterModals.fiberSelectGroup;
        const select = this.splitterModals.fiberSelectFiber;

        if (!val) {
            group.classList.add('hidden');
            return;
        }

        const { connId } = JSON.parse(val);
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);

        if (connection) {
            select.innerHTML = '<option value="">Seleccionar hilo...</option>';

            // Determine direction relative to current node
            // If current node is 'from', we are sending from 'from', so we need 'fromTermination' to be free
            // If current node is 'to', we are sending from 'to', so we need 'toTermination' to be free
            const isFromNode = connection.from === this.currentSplitterNodeId;

            const availableFibers = connection.fiberDetails.filter(f => {
                return isFromNode ? !f.fromTermination : !f.toTermination;
            });

            if (availableFibers.length === 0) {
                select.innerHTML = '<option value="">Sin hilos disponibles</option>';
            } else {
                availableFibers.forEach(f => {
                    const option = document.createElement('option');
                    option.value = f.number;
                    option.textContent = `Hilo ${f.number} (${f.color})`;
                    select.appendChild(option);
                });
            }
            group.classList.remove('hidden');
        }
    }

    fiberConnGoToStep1() {
        this.splitterModals.fiberConnStep1.classList.remove('hidden');
        this.splitterModals.fiberConnStep2.classList.add('hidden');
        this.splitterModals.fiberConnStep3.classList.add('hidden');
    }

    fiberConnGoToStep2() {
        // Logic to show equipment list if target is RACK
        const val = this.splitterModals.fiberDestNode.value;
        if (!val) return;

        const { nodeId } = JSON.parse(val);
        const node = this.inventoryManager.getNode(nodeId);

        if (node.type === 'RACK' || node.type === 'ODF') {
            // For RACK/ODF nodes, show equipment selection
            const list = this.splitterModals.fiberDestEquipList;
            list.innerHTML = '';
            node.rack.forEach(eq => {
                const item = document.createElement('div');
                item.className = 'nav-btn';
                item.textContent = `${eq.name} (${eq.type})`;
                item.onclick = () => {
                    this.selectedDestEquip = eq;
                    this.fiberConnGoToStep3();
                };
                list.appendChild(item);
            });

            this.splitterModals.fiberConnStep1.classList.add('hidden');
            this.splitterModals.fiberConnStep2.classList.remove('hidden');
        } else {
            // For other node types (ONU, NAP, MUFLA, etc.), connect directly via fiber
            this.finalizeDirectFiberConnection();
        }
    }

    fiberConnGoToStep3() {
        const grid = this.splitterModals.fiberDestPortList;
        grid.innerHTML = '';

        this.selectedDestEquip.ports.forEach(port => {
            const btn = document.createElement('div');
            btn.className = 'port-item';
            btn.textContent = port.number;

            if (port.status === 'connected') {
                btn.style.backgroundColor = '#eee';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.onclick = async () => await this.finalizeFiberConnection(port);
            }
            grid.appendChild(btn);
        });

        this.splitterModals.fiberConnStep2.classList.add('hidden');
        this.splitterModals.fiberConnStep3.classList.remove('hidden');
    }

    async finalizeFiberConnection(destPort) {
        // 1. Get selected outgoing connection
        const { nodeId, connId } = JSON.parse(this.splitterModals.fiberDestNode.value);
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);

        // 2. Get selected fiber
        const fiberNum = this.splitterModals.fiberSelectFiber.value;
        if (!fiberNum) {
            alert('Por favor selecciona un hilo de salida.');
            return;
        }

        const isFromNode = connection.from === this.currentSplitterNodeId;
        const availableFiber = connection.fiberDetails.find(f => f.number === parseInt(fiberNum));

        if (!availableFiber || (isFromNode ? availableFiber.fromTermination : availableFiber.toTermination)) {
            alert('El hilo seleccionado no está disponible para salida.');
            return;
        }

        // 3. Update Splitter Port
        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, this.currentSplitterId);
        const splitterPort = splitter.outputPorts.find(p => p.portNumber === this.selectedSplitterPort.portNumber);
        splitterPort.used = true;
        splitterPort.connectedTo = {
            connectionId: connId,
            fiberNumber: availableFiber.number
        };

        // 4. Update Fiber
        const splitterTermination = {
            nodeId: this.currentSplitterNodeId,
            splitterId: this.currentSplitterId,
            port: splitterPort.portNumber
        };

        const destTermination = {
            nodeId: nodeId,
            equipId: this.selectedDestEquip.id,
            portId: destPort.id
        };

        if (isFromNode) {
            availableFiber.fromTermination = splitterTermination;
            availableFiber.toTermination = destTermination;
        } else {
            availableFiber.toTermination = splitterTermination;
            availableFiber.fromTermination = destTermination;
        }

        // 5. Update Destination Port
        const destNode = this.inventoryManager.getNode(nodeId);
        const equip = destNode.rack.find(e => e.id === this.selectedDestEquip.id);
        const port = equip.ports.find(p => p.id === destPort.id);
        port.status = 'connected';
        port.connectedTo = {
            equipId: 'SPLITTER', // Placeholder
            equipName: `Splitter ${splitter.type} (Mufla)`,
            portId: `split-${splitter.id}-p${splitterPort.portNumber}`
        };

        await this.inventoryManager.updateConnection(connection);
        await this.inventoryManager.updateNode(destNode); // Save port changes

        alert(`Conectado exitosamente vía Hilo ${availableFiber.number} (${availableFiber.color})`);

        this.splitterModals.fiberConnection.classList.add('hidden');
        this.showSplitterPorts(this.currentSplitterId);
    }

    async finalizeDirectFiberConnection() {
        // For direct connections to non-RACK nodes (ONU, NAP, MUFLA, etc.)
        const { nodeId, connId } = JSON.parse(this.splitterModals.fiberDestNode.value);
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);

        // Get selected fiber
        const fiberNum = this.splitterModals.fiberSelectFiber.value;
        if (!fiberNum) {
            alert('Por favor selecciona un hilo de salida.');
            return;
        }

        const isFromNode = connection.from === this.currentSplitterNodeId;
        const availableFiber = connection.fiberDetails.find(f => f.number === parseInt(fiberNum));

        if (!availableFiber || (isFromNode ? availableFiber.fromTermination : availableFiber.toTermination)) {
            alert('El hilo seleccionado no está disponible para salida.');
            return;
        }

        // Update Splitter Port
        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, this.currentSplitterId);
        const splitterPort = splitter.outputPorts.find(p => p.portNumber === this.selectedSplitterPort.portNumber);
        splitterPort.used = true;
        splitterPort.connectedTo = {
            connectionId: connId,
            fiberNumber: availableFiber.number
        };

        // Update Fiber
        const splitterTermination = {
            nodeId: this.currentSplitterNodeId,
            splitterId: this.currentSplitterId,
            port: splitterPort.portNumber
        };

        const destTermination = {
            nodeId: nodeId,
            equipId: null,  // No equipment for direct node connection
            portId: null    // No port for direct node connection
        };

        if (isFromNode) {
            availableFiber.fromTermination = splitterTermination;
            availableFiber.toTermination = destTermination;
        } else {
            availableFiber.toTermination = splitterTermination;
            availableFiber.fromTermination = destTermination;
        }

        // Update splitter node
        const splitterNode = this.inventoryManager.getNode(this.currentSplitterNodeId);
        await this.inventoryManager.updateNode(splitterNode);

        // Update connection
        await this.inventoryManager.updateConnection(connection);

        alert(`Conectado exitosamente a nodo vía Hilo ${availableFiber.number} (${availableFiber.color})`);

        this.splitterModals.fiberConnection.classList.add('hidden');
        this.showSplitterPorts(this.currentSplitterId);
    }

    // --- Fusion Management Logic ---

    openFusionModal(isRack = false) {
        this.fusionState.nodeId = isRack ? this.currentRackNodeId : this.currentSplitterNodeId;
        this.fusionState.isRack = isRack;

        if (!this.fusionState.nodeId) {
            console.error('No active node ID for fusion');
            return;
        }

        const node = this.inventoryManager.getNode(this.fusionState.nodeId);

        if (isRack) {
            // Special ODF mode for Racks
            this.openODFFusionModal(node);
        } else {
            // Normal fiber-to-fiber fusion mode
            this.openNormalFusionModal(node);
        }
    }

    openNormalFusionModal(node) {
        // Populate cable dropdowns
        const connections = this.inventoryManager.getConnections().filter(c =>
            c.from === this.fusionState.nodeId || c.to === this.fusionState.nodeId
        );

        const populateSelect = (select, selectedValue = null) => {
            select.innerHTML = '<option value="">Seleccionar cable...</option>';
            connections.forEach(conn => {
                const otherNodeId = conn.from === this.fusionState.nodeId ? conn.to : conn.from;
                const otherNode = this.inventoryManager.getNode(otherNodeId);
                const option = document.createElement('option');
                option.value = conn.id;
                option.textContent = `${conn.cableType} (${conn.fibers}h) -> ${otherNode.name}`;
                if (selectedValue === conn.id) option.selected = true;
                select.appendChild(option);
            });
        };

        // Smart defaults: Select first two different cables
        const connA = connections.length > 0 ? connections[0].id : '';
        const connB = connections.length > 1 ? connections[1].id : '';

        populateSelect(this.fusionUI.cableA, connA);
        populateSelect(this.fusionUI.cableB, connB);

        // Update labels
        this.fusionUI.cableA.previousElementSibling.textContent = 'Cable A (Origen/Entrada)';
        this.fusionUI.cableB.previousElementSibling.textContent = 'Cable B (Destino/Salida)';

        // Clear lists
        this.fusionUI.listA.innerHTML = '';
        this.fusionUI.listB.innerHTML = '';

        // Reset state
        this.fusionState.selectedFiberA = null;
        this.fusionState.selectedFiberB = null;
        this.updateFusionButtons();

        this.modals.fusion.classList.remove('hidden');

        // Trigger render if defaults set
        if (connA) this.handleFusionCableChange('A');
        if (connB) this.handleFusionCableChange('B');
    }

    openODFFusionModal(node) {
        // For Rack: Left side = ODF ports, Right side = Fiber strands

        console.log('Opening ODF Fusion Modal for node:', node);
        console.log('Node rack:', node.rack);

        // Update labels
        this.fusionUI.cableA.previousElementSibling.textContent = 'Equipo ODF';
        this.fusionUI.cableB.previousElementSibling.textContent = 'Cable de Fibra';

        // Populate ODF equipment selector
        // Equipment is stored in node.rack, not node.equipment
        const allEquipment = node.rack || [];
        console.log('All equipment:', allEquipment);

        const odfEquipment = allEquipment.filter(eq => {
            console.log('Checking equipment:', eq, 'Type:', eq.type);
            return eq.type === 'ODF';
        });

        console.log('Filtered ODF equipment:', odfEquipment);

        this.fusionUI.cableA.innerHTML = '<option value="">Seleccionar ODF...</option>';

        if (odfEquipment.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No hay equipos ODF en este rack';
            option.disabled = true;
            this.fusionUI.cableA.appendChild(option);
        } else {
            odfEquipment.forEach(eq => {
                const option = document.createElement('option');
                option.value = eq.id;
                // Fix: eq.ports might be an object, convert to number
                const portCount = typeof eq.ports === 'number' ? eq.ports : (eq.ports?.length || 0);
                option.textContent = `${eq.name} (${portCount} puertos)`;
                this.fusionUI.cableA.appendChild(option);
            });
        }

        // Populate fiber cable selector
        const connections = this.inventoryManager.getConnections().filter(c =>
            c.from === this.fusionState.nodeId || c.to === this.fusionState.nodeId
        );
        this.fusionUI.cableB.innerHTML = '<option value="">Seleccionar cable...</option>';
        connections.forEach(conn => {
            const otherNodeId = conn.from === this.fusionState.nodeId ? conn.to : conn.from;
            const otherNode = this.inventoryManager.getNode(otherNodeId);
            const option = document.createElement('option');
            option.value = conn.id;
            option.textContent = `${conn.cableType} (${conn.fibers}h) -> ${otherNode.name}`;
            this.fusionUI.cableB.appendChild(option);
        });

        // Clear lists
        this.fusionUI.listA.innerHTML = '';
        this.fusionUI.listB.innerHTML = '';

        // Reset state
        this.fusionState.selectedFiberA = null;
        this.fusionState.selectedFiberB = null;
        this.fusionState.selectedODFEquipId = null;
        this.updateFusionButtons();

        this.modals.fusion.classList.remove('hidden');

        // Auto-select first ODF if available
        if (odfEquipment.length > 0) {
            this.fusionUI.cableA.value = odfEquipment[0].id;
            this.handleFusionCableChange('A');
        }
    }

    handleFusionCableChange(side) {
        const select = side === 'A' ? this.fusionUI.cableA : this.fusionUI.cableB;
        const list = side === 'A' ? this.fusionUI.listA : this.fusionUI.listB;
        const value = select.value;

        if (!value) {
            list.innerHTML = '';
            return;
        }

        if (this.fusionState.isRack && side === 'A') {
            // Render ODF ports
            this.renderODFPorts(value, list);
        } else if (this.fusionState.isRack && side === 'B') {
            // Render fiber strands
            const connection = this.inventoryManager.getConnections().find(c => c.id === value);
            this.renderFusionFibers(connection, list, side);
        } else {
            // Normal mode: render fibers
            const connection = this.inventoryManager.getConnections().find(c => c.id === value);
            this.renderFusionFibers(connection, list, side);
        }
    }

    renderODFPorts(equipId, container) {
        container.innerHTML = '';
        const node = this.inventoryManager.getNode(this.fusionState.nodeId);
        const equipment = (node.rack || []).find(eq => eq.id === equipId);

        if (!equipment) {
            console.error('Equipment not found:', equipId);
            return;
        }

        console.log('Rendering ODF ports for equipment:', equipment);

        this.fusionState.selectedODFEquipId = equipId;

        // Get port count - handle both number and object
        const portCount = typeof equipment.ports === 'number' ? equipment.ports : (equipment.ports?.length || 24);
        console.log('Port count:', portCount);

        for (let i = 1; i <= portCount; i++) {
            const port = equipment.portData?.find(p => p.id === i) || { id: i, connected: false };

            const item = document.createElement('div');
            item.className = `fusion-fiber-item ${port.fiberConnection ? 'connected' : ''}`;

            let statusText = 'Libre';
            if (port.fiberConnection) {
                statusText = `Conectado a Hilo ${port.fiberConnection.fiberNumber}`;
            }

            item.innerHTML = `
                <div class="fiber-color" style="background-color: #4a90e2; border-radius: 4px;"></div>
                <div class="fusion-fiber-info">
                    <span class="fusion-fiber-name">Puerto ${i}</span>
                    <span class="fusion-fiber-detail">${statusText}</span>
                </div>
            `;

            item.onclick = () => {
                this.handleODFPortSelection(equipId, port, item);
            };

            container.appendChild(item);
        }
    }

    handleODFPortSelection(equipId, port, element) {
        const list = this.fusionUI.listA;
        list.querySelectorAll('.fusion-fiber-item').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        this.fusionState.selectedFiberA = {
            equipId: equipId,
            portId: port.id,
            isConnected: !!port.fiberConnection
        };

        this.updateFusionButtons();
    }

    renderFusionFibers(connection, container, side) {
        container.innerHTML = '';
        const isFromNode = connection.from === this.fusionState.nodeId;

        connection.fiberDetails.forEach(fiber => {
            const item = document.createElement('div');

            // Determine status
            const termination = isFromNode ? fiber.fromTermination : fiber.toTermination;

            let statusText = 'Libre';
            let isConnected = false;
            let isSplitter = false;
            let isEquip = false;

            if (termination) {
                if (termination.connectionId) {
                    isConnected = true;
                    statusText = `Fusionado con Hilo ${termination.fiberNumber}`;
                } else if (termination.splitterId) {
                    isConnected = true;
                    isSplitter = true;
                    statusText = `✂️ En Splitter (Puerto ${termination.port})`;
                } else if (termination.equipId) {
                    isConnected = true;
                    isEquip = true;
                    const portInfo = termination.portId ? ` Puerto ${termination.portId}` : '';
                    statusText = `🔌 En ODF${portInfo}`;
                } else if (termination.nodeId === this.fusionState.nodeId) {
                    statusText = 'Disponible en nodo';
                }
            }

            // Style classes
            let classes = ['fusion-fiber-item'];
            if (isConnected) classes.push('connected');
            if (isSplitter || isEquip) classes.push('used'); // Visual style for occupied/consumed

            item.className = classes.join(' ');
            item.innerHTML = `
                <div class="fiber-color ${fiber.color.toLowerCase()}"></div>
                <div class="fusion-fiber-info">
                    <span class="fusion-fiber-name">Hilo ${fiber.number} (${fiber.color})</span>
                    <span class="fusion-fiber-detail">${statusText}</span>
                </div>
            `;

            // Allow selection if:
            // - Free/generic (not connected)
            // - Connected via fusion (connectionId) - can be broken
            // - Connected to ODF (equipId) - can be broken
            // BUT NOT if connected to splitter (splitterId) - these are consumed
            const isSelectable = !isSplitter;

            if (isSelectable) {
                item.onclick = () => {
                    this.handleFusionSelection(side, connection.id, fiber, item, isConnected);
                };
            } else {
                item.style.cursor = 'not-allowed';
                item.style.opacity = '0.7';
            }

            container.appendChild(item);
        });
    }

    handleFusionSelection(side, connId, fiber, element, isConnected) {
        // Deselect previous in this list
        const list = side === 'A' ? this.fusionUI.listA : this.fusionUI.listB;
        list.querySelectorAll('.fusion-fiber-item').forEach(el => el.classList.remove('selected'));

        // Select new
        element.classList.add('selected');

        const selection = { connId, fiberNumber: fiber.number, isConnected };

        if (side === 'A') {
            this.fusionState.selectedFiberA = selection;
        } else {
            this.fusionState.selectedFiberB = selection;
        }

        this.updateFusionButtons();
    }

    updateFusionButtons() {
        const { selectedFiberA, selectedFiberB } = this.fusionState;
        const btnConnect = this.fusionUI.btnConnect;
        const btnDisconnect = this.fusionUI.btnDisconnect;

        // Connect logic: Both selected, both NOT connected
        const canConnect = selectedFiberA && selectedFiberB &&
            !selectedFiberA.isConnected && !selectedFiberB.isConnected;

        // Disconnect logic: Either selected, and IS connected via fusion
        const canDisconnect = (selectedFiberA && selectedFiberA.isConnected) ||
            (selectedFiberB && selectedFiberB.isConnected);

        btnConnect.disabled = !canConnect;
        btnDisconnect.disabled = !canDisconnect;
    }

    async fusionConnect() {
        const { selectedFiberA, selectedFiberB, nodeId, isRack } = this.fusionState;
        if (!selectedFiberA || !selectedFiberB) return;

        if (isRack) {
            // ODF mode: Connect ODF port to fiber strand
            await this.connectODFToFiber();
        } else {
            // Normal mode: Connect fiber to fiber
            await this.connectFiberToFiber();
        }
    }

    async connectODFToFiber() {
        const { selectedFiberA, selectedFiberB, nodeId, selectedODFEquipId } = this.fusionState;

        // selectedFiberA = ODF port
        // selectedFiberB = Fiber strand

        const node = this.inventoryManager.getNode(nodeId);
        const equipment = (node.rack || []).find(eq => eq.id === selectedODFEquipId);

        if (!equipment) {
            alert('Error: No se encontró el equipo ODF.');
            return;
        }

        // Initialize portData if it doesn't exist
        if (!equipment.portData) {
            equipment.portData = [];
        }

        // Find or create port
        let port = equipment.portData.find(p => p.id === selectedFiberA.portId);
        if (!port) {
            port = { id: selectedFiberA.portId, connected: false };
            equipment.portData.push(port);
        }

        // Store fiber connection info in ODF port
        port.fiberConnection = {
            connectionId: selectedFiberB.connId,
            fiberNumber: selectedFiberB.fiberNumber
        };
        port.connected = true;

        // Update node
        await this.inventoryManager.updateNode(node);

        // NOW: Update the fiber connection to show it's connected to ODF
        const connection = this.inventoryManager.getConnections().find(c => c.id === selectedFiberB.connId);
        if (connection) {
            const fiber = connection.fiberDetails.find(f => f.number === selectedFiberB.fiberNumber);
            if (fiber) {
                // Determine which termination to use based on connection direction
                const isFromNode = connection.from === nodeId;

                const termination = {
                    nodeId: nodeId,
                    equipId: selectedODFEquipId,
                    portId: selectedFiberA.portId
                };

                if (isFromNode) {
                    fiber.fromTermination = termination;
                } else {
                    fiber.toTermination = termination;
                }

                // Update connection in database
                await this.inventoryManager.updateConnection(connection);
            }
        }

        alert('Conexión ODF-Fibra realizada con éxito.');

        // Refresh lists
        this.handleFusionCableChange('A');
        this.handleFusionCableChange('B');
        this.updateFusionButtons();
    }

    async connectFiberToFiber() {
        const { selectedFiberA, selectedFiberB, nodeId } = this.fusionState;

        // Validation: Cannot fuse same fiber to itself
        if (selectedFiberA.connId === selectedFiberB.connId && selectedFiberA.fiberNumber === selectedFiberB.fiberNumber) {
            alert('No puedes fusionar un hilo consigo mismo.');
            return;
        }

        // Get connections
        const connA = this.inventoryManager.getConnections().find(c => c.id === selectedFiberA.connId);
        const connB = this.inventoryManager.getConnections().find(c => c.id === selectedFiberB.connId);

        const fiberA = connA.fiberDetails.find(f => f.number === selectedFiberA.fiberNumber);
        const fiberB = connB.fiberDetails.find(f => f.number === selectedFiberB.fiberNumber);

        // Determine termination slots
        const isFromNodeA = connA.from === nodeId;
        const isFromNodeB = connB.from === nodeId;

        // Update Fiber A
        const termA = {
            nodeId: nodeId,
            connectionId: connB.id,
            fiberNumber: fiberB.number
        };
        if (isFromNodeA) fiberA.fromTermination = termA;
        else fiberA.toTermination = termA;

        // Update Fiber B
        const termB = {
            nodeId: nodeId,
            connectionId: connA.id,
            fiberNumber: fiberA.number
        };
        if (isFromNodeB) fiberB.fromTermination = termB;
        else fiberB.toTermination = termB;

        // Save
        await this.inventoryManager.updateConnection(connA);
        if (connA.id !== connB.id) {
            await this.inventoryManager.updateConnection(connB);
        }

        alert('Fusión realizada con éxito.');

        // Refresh lists
        this.handleFusionCableChange('A');
        this.handleFusionCableChange('B');
        this.updateFusionButtons();
    }

    async fusionDisconnect() {
        const { selectedFiberA, selectedFiberB, nodeId, isRack } = this.fusionState;

        if (isRack) {
            // ODF mode: disconnect ODF port from fiber
            await this.disconnectODFFromFiber();
        } else {
            // Normal mode: disconnect fiber from fiber
            const disconnectFiber = async (selection) => {
                if (!selection || !selection.isConnected) return;

                const conn = this.inventoryManager.getConnections().find(c => c.id === selection.connId);
                const fiber = conn.fiberDetails.find(f => f.number === selection.fiberNumber);
                const isFromNode = conn.from === nodeId;

                const termination = isFromNode ? fiber.fromTermination : fiber.toTermination;

                // Check if it's a fusion (has connectionId)
                if (termination && termination.connectionId) {
                    // We also need to clear the OTHER side of the fusion
                    const otherConn = this.inventoryManager.getConnections().find(c => c.id === termination.connectionId);
                    if (otherConn) {
                        const otherFiber = otherConn.fiberDetails.find(f => f.number === termination.fiberNumber);
                        if (otherFiber) {
                            // Find which slot points back to us
                            if (otherFiber.fromTermination && otherFiber.fromTermination.nodeId === nodeId) {
                                otherFiber.fromTermination = null;
                            } else if (otherFiber.toTermination && otherFiber.toTermination.nodeId === nodeId) {
                                otherFiber.toTermination = null;
                            }
                            await this.inventoryManager.updateConnection(otherConn);
                        }
                    }

                    // Clear this side
                    if (isFromNode) fiber.fromTermination = null;
                    else fiber.toTermination = null;

                    await this.inventoryManager.updateConnection(conn);
                } else {
                    alert('Este hilo no está fusionado con otro cable (puede estar conectado a un equipo o splitter). Usa las otras herramientas para desconectarlo.');
                }
            };

            if (selectedFiberA) await disconnectFiber(selectedFiberA);
            if (selectedFiberB && (!selectedFiberA || selectedFiberA.connId !== selectedFiberB.connId || selectedFiberA.fiberNumber !== selectedFiberB.fiberNumber)) {
                await disconnectFiber(selectedFiberB);
            }

            // Refresh lists
            this.handleFusionCableChange('A');
            this.handleFusionCableChange('B');
            this.updateFusionButtons();
        }
    }

    async disconnectODFFromFiber() {
        const { selectedFiberA, selectedFiberB, nodeId, selectedODFEquipId } = this.fusionState;

        // Can disconnect from either side
        if (selectedFiberA && selectedFiberA.equipId) {
            // Disconnecting from ODF port side
            const node = this.inventoryManager.getNode(nodeId);
            const equipment = (node.rack || []).find(eq => eq.id === selectedFiberA.equipId);

            if (equipment && equipment.portData) {
                const port = equipment.portData.find(p => p.id === selectedFiberA.portId);
                if (port && port.fiberConnection) {
                    // Clear the fiber side
                    const conn = this.inventoryManager.getConnections().find(c => c.id === port.fiberConnection.connectionId);
                    if (conn) {
                        const fiber = conn.fiberDetails.find(f => f.number === port.fiberConnection.fiberNumber);
                        if (fiber) {
                            const isFromNode = conn.from === nodeId;
                            if (isFromNode) fiber.fromTermination = null;
                            else fiber.toTermination = null;
                            await this.inventoryManager.updateConnection(conn);
                        }
                    }

                    // Clear ODF port
                    port.fiberConnection = null;
                    port.connected = false;
                    await this.inventoryManager.updateNode(node);
                }
            }
        }

        if (selectedFiberB && selectedFiberB.isConnected) {
            // Disconnecting from fiber side
            const conn = this.inventoryManager.getConnections().find(c => c.id === selectedFiberB.connId);
            if (conn) {
                const fiber = conn.fiberDetails.find(f => f.number === selectedFiberB.fiberNumber);
                if (fiber) {
                    const isFromNode = conn.from === nodeId;
                    const termination = isFromNode ? fiber.fromTermination : fiber.toTermination;

                    if (termination && termination.equipId) {
                        // Clear ODF port
                        const node = this.inventoryManager.getNode(nodeId);
                        const equipment = (node.rack || []).find(eq => eq.id === termination.equipId);
                        if (equipment && equipment.portData) {
                            const port = equipment.portData.find(p => p.id === termination.portId);
                            if (port) {
                                port.fiberConnection = null;
                                port.connected = false;
                                await this.inventoryManager.updateNode(node);
                            }
                        }

                        // Clear fiber
                        if (isFromNode) fiber.fromTermination = null;
                        else fiber.toTermination = null;
                        await this.inventoryManager.updateConnection(conn);
                    }
                }
            }
        }

        alert('Conexión ODF-Fibra eliminada con éxito.');

        // Refresh lists
        this.handleFusionCableChange('A');
        this.handleFusionCableChange('B');
        this.updateFusionButtons();
    }

    loadExistingData() {
        // Refresh list first so it appears even if map rendering fails
        this.refreshNodeList();

        // Load Nodes
        const nodes = this.inventoryManager.getNodes();
        nodes.forEach(node => {
            try {
                this.mapManager.addMarker(node);
            } catch (e) {
                console.error("Error loading node marker:", node, e);
            }
        });

        // Load Connections
        const connections = this.inventoryManager.getConnections();
        connections.forEach(conn => {
            try {
                this.mapManager.addConnection(conn);
            } catch (e) {
                console.error("Error loading connection:", conn, e);
            }
        });
    }

    refreshNodeList() {
        const container = document.getElementById('node-list-container');
        const nodes = this.inventoryManager.getNodes();

        if (nodes.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay nodos registrados.</p>';
            return;
        }

        container.innerHTML = '';
        nodes.forEach(node => {
            const item = document.createElement('div');
            item.className = 'nav-btn';
            item.style.fontSize = '14px';
            item.innerHTML = `
                <span style="color: ${this.mapManager.getColorForType(node.type)}">●</span>
                    ${node.name} <small style="margin-left:auto; opacity:0.6">${node.type}</small>
            `;
            item.addEventListener('click', () => {
                this.showNodeDetails(node.id);
                this.mapManager.map.setView([node.lat, node.lng], 16);
            });
            container.appendChild(item);
        });
    }



    resetForm() {
        this.form.form.reset();
        this.tempLocation = null;
        this.form.clientFields.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mapManager = new MapManager('map');
    mapManager.init();
    const inventoryManager = new InventoryManager();

    // Set global reference for MapManager to check connections
    window.inventoryManagerRef = inventoryManager;

    const uiManager = new UIManager(mapManager, inventoryManager);
    uiManager.init();

    // Initialize User Manager
    const userManager = new UserManager(uiManager);
    userManager.init();

    // Initialize Admin Manager
    const adminManager = new AdminManager();
    window.adminManager = adminManager;

    // Expose for debugging/testing
    window.mapManager = mapManager;
    window.inventoryManager = inventoryManager;
    window.uiManager = uiManager;
    window.userManager = userManager;
});
