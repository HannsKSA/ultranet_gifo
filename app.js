/**
 * SGIFO - Sistema de Gestión de Infraestructura de Fibra Óptica
 * Main Application Logic
 */

// Debug: Global click listener
window.addEventListener('click', (e) => {
    console.log('Global Click detected on:', e.target.tagName, 'ID:', e.target.id, 'Classes:', e.target.className);
}, true);

window.onerror = function (msg, url, line, col, error) {
    console.error('GLOBAL ERROR:', msg, 'at', url, ':', line, ':', col);
    return false;
};

console.log('🚀 SGIFO app.js v40 starting...');

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

        if (node.customFields && node.customFields.plano_id) return;

        // Custom icon based on type
        let iconColor = this.getColorForType(node.type);

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

        // Check for unresolved damage reports
        let damageAlertIcon = '';
        if (node.damageReports && node.damageReports.length > 0) {
            const hasUnresolvedReports = node.damageReports.some(r => !r.resolved);
            if (hasUnresolvedReports) {
                damageAlertIcon = '<div class="damage-alert-icon" title="Reportes de Daño Pendientes">🔴</div>';
            }
        }

        let iconHtml = `<div style="position:relative;">${damageAlertIcon}<div style="background-color: ${iconColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5);"></div>${warningIcon}${internetIcon}</div>`;

        if (node.type === 'ONU') {
            iconHtml = `<div style="position:relative;">${damageAlertIcon}<div style="background-color: ${iconColor}; width: 12px; height: 12px; border-radius: 2px; border: 1px solid white;">🏠</div>${warningIcon}${internetIcon}</div>`;
        }

        const marker = L.marker([node.lat, node.lng], {
            icon: L.divIcon({
                className: 'custom-node-icon',
                html: iconHtml,
                iconSize: [24, 24]
            })
        }).addTo(this.map);

        marker.bindTooltip(node.name, { permanent: false, direction: 'top' });

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
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
        if (window.uiManager && window.uiManager.customNodeTypes) {
            const custom = window.uiManager.customNodeTypes.find(t => t.name === type);
            if (custom) return custom.color;
        }
        return '#95a5a6';
    }

    removeMarker(nodeId) {
        if (this.markers[nodeId]) {
            this.map.removeLayer(this.markers[nodeId]);
            delete this.markers[nodeId];
        }
    }

    updateMarker(nodeId, latlng) {
        if (this.markers[nodeId]) {
            this.markers[nodeId].setLatLng(latlng);
        }
    }

    // Updated to support waypoints
    addConnection(connection) {
        if (connection.fiberDetails && connection.fiberDetails[0] && connection.fiberDetails[0].plano_id) return null; // Skip non-geographic cables

        if (this.connections[connection.id]) {
            this.map.removeLayer(this.connections[connection.id]);
        }

        // Style based on cable type (optional visual distinction)
        let color = '#333';
        let weight = 3;

        const type = (connection.cableType || '').toUpperCase();
        if (type.includes('DROP')) {
            color = '#e67e22'; // Orange for drops
            weight = 2;
        } else if (type.includes('SUBTERRANEO')) {
            color = '#8b4513'; // Brown for underground
            weight = 4;
        } else if (type.includes('UTP')) {
            color = '#3498db'; // Blue for UTP
        } else if (type.includes('ADSS') || type.includes('ASU') || type.includes('FIBRA')) {
            color = '#333'; // Dark for main fiber
        }

        const polyline = L.polyline(connection.path, { color: color, weight: weight, opacity: 0.7 }).addTo(this.map);

        polyline.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            document.dispatchEvent(new CustomEvent('connection:clicked', { detail: { id: connection.id, latlng: e.latlng } }));
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

    resetNetworkStyles(inventoryManager) {
        Object.keys(this.connections).forEach(id => {
            const poly = this.connections[id];
            let color = '#333';
            let weight = 3;

            if (inventoryManager) {
                const conn = inventoryManager.getConnections().find(c => c.id === id);
                if (conn) {
                    const type = (conn.cableType || '').toUpperCase();
                    if (type.includes('DROP')) {
                        color = '#e67e22';
                        weight = 2;
                    } else if (type.includes('SUBTERRANEO')) {
                        color = '#8b4513';
                        weight = 4;
                    } else if (type.includes('UTP')) {
                        color = '#3498db';
                    }
                }
            }
            poly.setStyle({ color: color, weight: weight, opacity: 0.7 });
        });
        Object.values(this.markers).forEach(marker => {
            marker.setOpacity(1);
        });
    }

    highlightConnection(id) {
        if (this.connections[id]) {
            this.connections[id].setStyle({ color: '#f1c40f', weight: 6, opacity: 1 });
            this.connections[id].bringToFront();
        }
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

    refreshAllConnections(inventoryManager) {
        const conns = inventoryManager.getConnections();
        conns.forEach(conn => {
            this.addConnection(conn);
        });
    }

    refreshAll(inventoryManager) {
        this.refreshAllMarkers(inventoryManager);
        this.refreshAllConnections(inventoryManager);
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

        document.getElementById('btn-close-projects').addEventListener('click', () => {
            this.projectModal.classList.add('hidden');
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
            // Don't force login, allow browsing
            console.log('No active session, login required for admin features');
        }

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN') {
                this.user = session.user;
                await this.loadProfile();
            } else if (event === 'SIGNED_OUT') {
                this.user = null;
                this.profile = null;
                // Don't auto-show login
                alert('Sesión cerrada');
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

            // Fetch Permissions for Role
            try {
                const { data: roleItem } = await supabaseClient
                    .from('master_list_items')
                    .select('permissions, master_lists!inner(name)')
                    .eq('value', this.profile.role)
                    .eq('master_lists.name', 'Roles de Usuario')
                    .maybeSingle();

                this.profile.permissions = (roleItem && roleItem.permissions) ? roleItem.permissions : {};
                console.log("Loaded Permissions:", this.profile.permissions);
            } catch (e) {
                console.error("Error loading role permissions:", e);
                this.profile.permissions = {};
            }

            this.hideLogin(); // Hide login modal after successful profile load
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
            // Don't force login on error
        }
    }

    updateHeader() {
        console.log("Updating header for user:", this.user.email);
        const profileEl = document.getElementById('user-profile-name');
        const statusDot = document.querySelector('.status-dot');

        if (statusDot) {
            statusDot.classList.add('online');
            statusDot.title = "Sistema JS Activo v40";
        }

        if (profileEl && this.profile) {
            profileEl.innerText = `${this.profile.role.toUpperCase()} | ${this.user.email}`;
            profileEl.style.display = 'inline-block';
            profileEl.style.fontSize = '12px';
            profileEl.style.color = '#34495e';

            // Handle Admin Button visibility based on permissions
            const btnAdmin = document.getElementById('btn-admin-panel');
            if (btnAdmin) {
                const perms = this.profile.permissions || {};
                btnAdmin.style.display = perms.view_admin ? 'flex' : 'none';
            }
        }
    }

    async loadProjects() {
        this.projectList.innerHTML = '<p class="empty-state">Cargando...</p>';
        const perms = this.profile.permissions || {};

        // Hide Create Button if they can't manage projects
        const btnCreate = document.getElementById('btn-create-project');
        if (perms.view_all_projects) {
            if (btnCreate) btnCreate.style.display = 'block';
        } else {
            if (btnCreate) btnCreate.style.display = 'none';
        }

        let projects = [];

        try {
            if (perms.view_all_projects) {
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

            // Auto-select last project if exists
            const lastId = localStorage.getItem('sgifo_selected_project_id');
            if (lastId) {
                const found = projects.find(p => p.id === lastId);
                if (found) {
                    console.log("Auto-selecting project:", found.name);
                    this.selectProject(found);
                }
            }

        } catch (e) {
            console.error("Error loading projects", e);
            this.projectList.innerHTML = '<p class="empty-state" style="color:red">Error cargando proyectos.</p>';
        }
    }

    renderProjects(projects) {
        this.projectList.innerHTML = '';

        // Add a "New Project" button directly at the top of the list for better visibility
        const addNewBtn = document.createElement('button');
        addNewBtn.className = 'action-btn';
        addNewBtn.style.marginBottom = '15px';
        addNewBtn.innerHTML = '✨ + Nuevo Proyecto';
        addNewBtn.onclick = () => {
            this.projectModal.classList.add('hidden');
            this.createProjectModal.classList.remove('hidden');
        };
        this.projectList.appendChild(addNewBtn);

        if (projects.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.innerText = 'No hay proyectos disponibles.';
            this.projectList.appendChild(empty);
            return;
        }

        projects.forEach(p => {
            const isActive = this.currentProject && this.currentProject.id === p.id;
            const item = document.createElement('div');
            item.className = 'inventory-card'; // Using inventory-card style for better look
            item.style.marginBottom = '10px';
            item.style.padding = '15px';
            if (isActive) {
                item.style.borderColor = 'var(--primary-color)';
                item.style.backgroundColor = 'rgba(128, 0, 32, 0.05)';
            }

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <strong style="font-size:16px; color:var(--primary-dark)">${p.name}</strong>
                        <p style="font-size:12px; color:#666; margin-top:4px;">${p.description || 'Sin descripción'}</p>
                        ${isActive ? '<span class="badge" style="background:#2ecc71; margin-top:8px;">ACTIVO</span>' : ''}
                    </div>
                    <button class="action-btn deploy-btn" style="width:auto; padding:5px 15px; font-size:12px;">
                        ${isActive ? 'Re-Desplegar' : 'Desplegar'}
                    </button>
                </div>
            `;

            // Clicking the card or the button selects/deploys the project
            const btn = item.querySelector('.deploy-btn');
            const doSelect = () => {
                this.selectProject(p);
            };
            item.addEventListener('click', (e) => {
                if (e.target !== btn) doSelect();
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                doSelect();
            });

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
        const isChanging = !this.currentProject || this.currentProject.id !== project.id;
        this.currentProject = project;
        localStorage.setItem('sgifo_selected_project_id', project.id);
        this.projectModal.classList.add('hidden');

        // Initialize Inventory with Project ID
        console.log("Selected Project:", project.name);

        // Update Window Title or Header
        document.querySelector('.sidebar-header p').innerText = `Proyecto: ${project.name}`;

        // Delegate to UIManager/InventoryManager
        if (this.uiManager) {
            this.uiManager.loadProject(project.id, this.profile.role).then(() => {
                // After loading, do NOT fit map to nodes automatically
                // This prevents the "stuck" feeling and allows the user to explore freely.
                // The map will stay at its default location or last position.
                // const nodes = this.uiManager.inventoryManager.getNodes();
                // if (nodes.length > 0) {
                //    const group = L.featureGroup(nodes.map(n => L.marker([n.lat, n.lng])));
                //    this.uiManager.mapManager.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
                // }
                // Refresh project list in background to update active state if panel opened again
                this.loadProjects();
            });
        }
    }
}

class AdminManager {
    constructor() {
        this.users = [];
        this.projects = [];
        this.modal = null;
        this.newNodeType = null;
        this.newCableType = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.createAdminButton();
        this.createAdminModal();
        this.initialized = true;
    }

    createAdminButton() {
        // Button is now in HTML, just attach the event listener
        const btn = document.getElementById('btn-admin-panel');
        if (!btn) return;

        btn.onclick = () => {
            console.log("Admin button clicked");
            this.openAdminPanel();
        };

        // Removed redundant onmousedown = setLock(true) to avoid race conditions
        // as openAdminPanel already handles locking correctly.

        // Add hover effect
        btn.onmouseover = () => btn.style.backgroundColor = '#3498db';
        btn.onmouseout = () => btn.style.backgroundColor = '#2c3e50';
    }

    createAdminModal() {
        const modalHtml = `
        <div id="modal-admin-panel" class="modal-overlay hidden" style="z-index: 2500;">
            <div class="modal-content" style="max-width: 800px; height: 80vh; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                    <h3>Panel de Super Admin</h3>
                    <button class="btn-secondary" onclick="window.adminManager.closeAdminPanel()">Cerrar</button>
                </div>
                <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <button class="action-btn" id="tab-projects" onclick="window.adminManager.switchTab('projects')">Mis Proyectos</button>
                    <button class="btn-secondary" id="tab-users" onclick="window.adminManager.switchTab('users')">Usuarios</button>
                    <button class="btn-secondary" id="tab-node-types" onclick="window.adminManager.switchTab('node-types')">Tipos de Nodo</button>
                    <button class="btn-secondary" id="tab-cable-types" onclick="window.adminManager.switchTab('cable-types')">Tipos de Cable</button>
                    <button class="btn-secondary" id="tab-lists" onclick="window.adminManager.switchTab('lists')">Gestión de Listas</button>
                </div>
                <div id="admin-content-projects" style="flex:1; overflow-y:auto;">
                     <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                        <button class="action-btn" style="padding:5px; width:auto; min-width:120px;" onclick="window.adminManager.refreshProjects()">🔄 Refrescar</button>
                        <button class="action-btn" style="background-color:#2ecc71; padding:5px; width:auto; min-width:150px;" onclick="window.adminManager.openCreateProjectPrompt()">+ NUEVO PROYECTO</button>
                     </div>
                     <div id="admin-project-list"></div>
                </div>
                <div id="admin-content-users" class="hidden" style="flex:1; overflow-y:auto;">
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <button class="action-btn" style="padding:5px;" onclick="window.adminManager.refreshUsers()">🔄 Refrescar</button>
                        <button class="action-btn" style="background-color:#2ecc71; padding:5px;" onclick="window.adminManager.openCreateUserPrompt()">+ Nuevo Usuario</button>
                    </div>
                    <table style="width:100%; font-size:13px; border-collapse: collapse;">
                        <thead style="background:#f5f5f5; text-align:left;">
                            <tr><th style="padding:8px;">Email</th><th style="padding:8px;">Rol</th><th style="padding:8px;">Acciones</th></tr>
                        </thead>
                        <tbody id="admin-user-list"></tbody>
                    </table>
                </div>
                <div id="admin-content-node-types" class="hidden" style="flex:1; overflow-y:auto;">
                     <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h4>Configuración de Tipos de Nodo</h4>
                        <button class="action-btn" style="background-color:#2ecc71; padding:5px; width:auto;" onclick="window.adminManager.openCreateNodeTypeModal()">+ Nuevo Tipo</button>
                     </div>
                     <div id="admin-node-types-list"></div>
                </div>
                <div id="admin-content-cable-types" class="hidden" style="flex:1; overflow-y:auto;">
                     <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h4>Configuración de Tipos de Cable</h4>
                        <button class="action-btn" style="background-color:#2ecc71; padding:5px; width:auto;" onclick="window.adminManager.openCreateCableTypeModal()">+ Nuevo Cable</button>
                     </div>
                     <div id="admin-cable-types-list"></div>
                </div>
                <div id="admin-content-lists" class="hidden" style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden;">
                     <div style="display:flex; gap:10px; padding:10px; border-bottom:1px solid #eee; background:#f5f5f5; font-size: 12px;">
                         <button class="action-btn" id="tab-list-master" style="width:auto; padding:5px 15px;" onclick="window.adminManager.switchListSubTab('master')">Listas Maestras</button>
                         <button class="btn-secondary" id="tab-list-infra" style="width:auto; padding:5px 15px;" onclick="window.adminManager.switchListSubTab('infra')">Nodos y Cables</button>
                     </div>
                     <div id="admin-list-master-container" style="flex:1; display:flex; overflow:hidden;">
                         <div id="admin-master-lists-sidebar" style="width:200px; border-right:1px solid #eee; padding:10px; overflow-y:auto; background:#f9f9f9;">
                             <!-- Sidebar for master list names -->
                         </div>
                         <div id="admin-master-list-items-container" style="flex:1; padding:15px; overflow-y:auto;">
                             <!-- Items table -->
                             <p style="color:#888;">Selecciona una lista a la izquierda</p>
                         </div>
                     </div>
                     <div id="admin-list-infra-container" class="hidden" style="flex:1; padding:15px; overflow-y:auto;">
                         <div style="display:flex; gap:10px; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                            <button class="action-btn" id="tab-infra-nodes" style="width:auto; padding:3px 10px; font-size:11px;" onclick="window.adminManager.switchInfraTab('nodes')">Nodos</button>
                            <button class="btn-secondary" id="tab-infra-conns" style="width:auto; padding:3px 10px; font-size:11px;" onclick="window.adminManager.switchInfraTab('conns')">Cables</button>
                         </div>
                         <div id="admin-list-nodes-container"></div>
                         <div id="admin-list-conns-container" class="hidden"></div>
                     </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = document.getElementById('modal-admin-panel');
    }

    openCreateProjectPrompt() {
        // Use userManager's modal but elevate it
        if (window.userManager) {
            const modal = window.userManager.createProjectModal;
            if (modal) {
                modal.style.zIndex = "3000"; // Above admin panel (2500)
                modal.classList.remove('hidden');
            }
        }
    }

    openCreateUserPrompt() {
        // Create user modal dynamically
        const modalId = 'modal-create-user';
        if (document.getElementById(modalId)) document.body.removeChild(document.getElementById(modalId));

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay" style="z-index: 3000;">
                <div class="modal-content" style="max-width: 450px;">
                    <h3 style="margin-bottom:20px; color:var(--primary-color);">Registrar Nuevo Usuario</h3>
                    
                    <div class="form-group">
                        <label class="form-label">Nombre Completo</label>
                        <input type="text" id="cu-fullname" class="form-input" placeholder="Nombre completo del usuario">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Correo Electrónico</label>
                        <input type="email" id="cu-email" class="form-input" placeholder="usuario@ejemplo.com">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Contraseña Temporal</label>
                        <input type="password" id="cu-password" class="form-input" placeholder="Minimo 6 caracteres">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Rol del Usuario</label>
                        <select id="cu-role" class="form-select">
                            <option value="tecnico">Técnico (Solo lectura y reportes)</option>
                            <option value="admin">Administrador (Gestión de inventario y proyectos)</option>
                            <option value="super-admin">Super Admin (Control total del sistema)</option>
                            <option value="cliente">Cliente (Vista restringida)</option>
                        </select>
                    </div>

                    <div class="form-actions" style="margin-top:25px; gap:10px;">
                        <button class="btn-secondary" style="flex:1;" onclick="document.body.removeChild(document.getElementById('${modalId}'))">Cancelar</button>
                        <button class="action-btn" style="flex:1;" onclick="window.adminManager.saveNewUser()">Crear Usuario</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async saveNewUser() {
        const email = document.getElementById('cu-email').value.trim();
        const password = document.getElementById('cu-password').value;
        const role = document.getElementById('cu-role').value;
        const full_name = document.getElementById('cu-fullname').value.trim();

        if (!email || !password || !full_name) {
            return alert("Por favor complete todos los campos (Nombre, Email y Contraseña).");
        }

        if (password.length < 6) {
            return alert("La contraseña debe tener al menos 6 caracteres.");
        }

        const modal = document.getElementById('modal-create-user');
        const btn = modal.querySelector('.action-btn');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Creando...";

        try {
            const resp = await fetch('/api/create_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role, full_name })
            });
            const res = await resp.json();

            if (res.success) {
                alert("Usuario creado exitosamente.");
                document.body.removeChild(modal);
                this.refreshUsers();
            } else {
                alert("Error al crear usuario: " + res.message);
                btn.disabled = false;
                btn.innerText = originalText;
            }
        } catch (e) {
            alert("Error de conexión: " + e.message);
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }

    async resetPassword(userId) {
        const password = prompt("Nueva contraseña:");
        if (!password) return;
        try {
            const resp = await fetch('/api/update_password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, new_password: password })
            });
            const res = await resp.json();
            if (res.success) alert("Contraseña actualizada.");
            else alert("Error: " + res.message);
        } catch (e) { alert("Error: " + e.message); }
    }

    async openAdminPanel() {
        console.log("Attempting to open Admin Panel. Current User:", window.userManager.user ? window.userManager.user.email : 'None');
        // Check if user is authenticated
        if (!window.userManager || !window.userManager.user) {
            console.log("No user found, showing login.");
            alert('Debes iniciar sesión para acceder al Panel Admin');
            if (window.userManager) {
                window.userManager.showLogin();
            }
            return;
        }

        const profile = window.userManager.profile || {};
        const perms = profile.permissions || {};
        console.log("User Profile Role:", profile.role, "Permissions:", perms);

        if (!perms.view_admin) {
            console.warn("User does not have view_admin permission. Closing panel attempt.");
            // If they don't have permission, they shouldn't even see the button, but just in case.
            if (profile.role !== 'super-admin') { // Emergency check for super-admin
                alert("No tienes permisos suficientes para acceder a esta área.");
                return;
            }
        }

        // Hide administrative setup tabs if not allowed to edit settings
        const adminTabs = ['tab-node-types', 'tab-cable-types', 'tab-lists'];
        adminTabs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = perms.edit_admin_settings ? 'block' : 'none';
        });

        // Hide "New Project" button if not allowed to edit settings
        const btnNewProj = document.querySelector('[onclick*="openCreateProjectPrompt"]');
        if (btnNewProj) btnNewProj.style.display = perms.edit_admin_settings ? 'block' : 'none';

        const locked = await this.setLock(true);
        if (locked) {
            this.modal.classList.remove('hidden');
            this.switchTab('projects');
        }
    }

    async closeAdminPanel() {
        await this.setLock(false);
        this.modal.classList.add('hidden');
    }

    async setLock(locked) {
        if (!window.inventoryManager || !window.inventoryManager.projectId) return true;

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const user = session ? session.user : null;
            if (!user) return false;

            if (locked) {
                console.log("Setting lock for project:", window.inventoryManager.projectId);
                // Check if someone else has it
                const { data: project, error: sError } = await supabaseClient.from('projects')
                    .select('admin_lock_user, admin_lock_timestamp')
                    .eq('id', window.inventoryManager.projectId)
                    .single();

                if (sError) {
                    console.error("Error fetching project lock status:", sError);
                }

                if (project && project.admin_lock_user && project.admin_lock_user !== user.id) {
                    const lockTime = new Date(project.admin_lock_timestamp);
                    const diff = (new Date() - lockTime) / 1000 / 60;
                    if (diff < 15) { // 15 mins lock
                        alert("⚠️ Otro administrador está actualmente en el panel. Por favor espera a que termine.");
                        return false;
                    }
                }

                // Set lock
                const { error: uError } = await supabaseClient.from('projects')
                    .update({
                        admin_lock_user: user.id,
                        admin_lock_timestamp: new Date().toISOString()
                    })
                    .eq('id', window.inventoryManager.projectId);

                if (uError) {
                    console.error("Error updating project lock:", uError);
                    // In production, if columns are missing, this fails. 
                }

                // Heartbeat
                if (this.lockInterval) clearInterval(this.lockInterval);
                this.lockInterval = setInterval(async () => {
                    const { error: hError } = await supabaseClient.from('projects')
                        .update({ admin_lock_timestamp: new Date().toISOString() })
                        .eq('id', window.inventoryManager.projectId);
                    if (hError) console.error("Lock heartbeat failed:", hError);
                }, 60000);

            } else {
                console.log("Releasing lock for project:", window.inventoryManager.projectId);
                if (this.lockInterval) clearInterval(this.lockInterval);
                await supabaseClient.from('projects')
                    .update({ admin_lock_user: null, admin_lock_timestamp: null })
                    .eq('id', window.inventoryManager.projectId);
            }
            return true;
        } catch (e) {
            console.error("Critical error in setLock:", e);
            return false;
        }
    }

    switchTab(tab) {
        document.getElementById('admin-content-users').classList.add('hidden');
        document.getElementById('admin-content-projects').classList.add('hidden');
        document.getElementById('admin-content-node-types').classList.add('hidden');
        document.getElementById('admin-content-cable-types').classList.add('hidden');
        document.getElementById('admin-content-lists').classList.add('hidden');
        document.getElementById(`admin-content-${tab}`).classList.remove('hidden');
        document.getElementById('tab-users').className = tab === 'users' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-projects').className = tab === 'projects' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-node-types').className = tab === 'node-types' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-cable-types').className = tab === 'cable-types' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-lists').className = tab === 'lists' ? 'action-btn' : 'btn-secondary';
        if (tab === 'users') this.refreshUsers();
        if (tab === 'projects') this.refreshProjects();
        if (tab === 'node-types') this.refreshNodeTypes();
        if (tab === 'cable-types') this.refreshCableTypes();
        if (tab === 'lists') this.switchListSubTab('master');
    }

    async refreshUsers() {
        const tbody = document.getElementById('admin-user-list');
        tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

        const perms = (window.userManager && window.userManager.profile) ? window.userManager.profile.permissions : {};

        try {
            let { data, error } = await supabaseClient.from('user_profiles').select('*').order('email');
            if (error) throw error;

            // Filter users if not super-admin
            if (!perms.manage_all_users) {
                const myProjects = (window.userManager.projects || []).map(p => p.id);
                if (myProjects.length > 0) {
                    const { data: assignments } = await supabaseClient.from('project_assignments').select('user_id').in('project_id', myProjects);
                    const myUserIds = assignments ? assignments.map(a => a.user_id) : [];
                    data = data.filter(u => myUserIds.includes(u.id) || u.id === window.userManager.user.id);
                } else {
                    data = data.filter(u => u.id === window.userManager.user.id);
                }
            }
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
                        <button class="btn-secondary" style="padding:2px 5px; font-size:11px;" onclick="window.adminManager.resetPassword('${u.id}')">🔑</button>
                        <button class="btn-danger" style="padding:2px 5px; font-size:11px;" onclick="window.adminManager.deleteUser('${u.id}')">🗑️</button>
                    </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) { tbody.innerHTML = `<tr><td colspan="3" style="color:red">Error: ${e.message}</td></tr>`; }
    }

    async updateRole(userId, newRole) {
        try {
            const { error } = await supabaseClient.from('user_profiles').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
        } catch (e) { alert('Error: ' + e.message); }
    }

    async deleteUser(userId) {
        if (!confirm("¿Eliminar usuario?")) return;
        const { error } = await supabaseClient.from('user_profiles').delete().eq('id', userId);
        if (error) alert(error.message); else this.refreshUsers();
    }

    async refreshProjects() {
        const list = document.getElementById('admin-project-list');
        if (!list) return;
        list.innerHTML = 'Cargando...';
        try {
            const { data: projects, error } = await supabaseClient.from('projects').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            list.innerHTML = '';

            const currentProjectId = window.userManager && window.userManager.currentProject ? window.userManager.currentProject.id : null;

            projects.forEach(p => {
                const isActive = p.id === currentProjectId;
                const div = document.createElement('div');
                div.style.border = '1px solid #eee';
                div.style.padding = '15px';
                div.style.marginBottom = '10px';
                div.style.borderRadius = '8px';
                div.style.backgroundColor = isActive ? 'rgba(46, 204, 113, 0.05)' : '#fff';
                div.style.borderColor = isActive ? '#2ecc71' : '#eee';

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:16px;">${p.name}</strong>
                            ${isActive ? '<span style="background:#2ecc71; color:white; font-size:10px; padding:2px 6px; border-radius:10px; margin-left:10px; font-weight:bold;">ACTIVO</span>' : ''}
                            <div style="font-size:12px; color:#666; margin-top:4px;">${p.description || 'Sin descripción'}</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                             <button class="action-btn" style="width:auto; padding:5px 12px; font-size:12px; background-color:${isActive ? '#3498db' : 'var(--primary-color)'}" 
                                onclick="window.userManager.selectProject(${JSON.stringify(p).replace(/"/g, '&quot;')}); window.adminManager.closeAdminPanel();">
                                ${isActive ? 'Re-Desplegar' : 'Desplegar'}
                             </button>
                             <button class="btn-secondary" style="font-size:12px; padding:5px 10px;" onclick="window.adminManager.manageProjectUsers('${p.id}', '${p.name}')">Usuarios</button>
                             <button class="btn-danger" style="font-size:12px; padding:5px 10px;" onclick="window.adminManager.deleteProject('${p.id}')">Eliminar</button>
                        </div>
                    </div>`;
                list.appendChild(div);
            });
        } catch (e) { list.innerHTML = `<p style="color:red">Error: ${e.message}</p>`; }
    }

    async deleteProject(projectId) {
        if (!confirm("¿Eliminar proyecto y sus datos?")) return;
        try {
            await supabaseClient.from('nodes').delete().eq('project_id', projectId);
            await supabaseClient.from('connections').delete().eq('project_id', projectId);
            await supabaseClient.from('projects').delete().eq('id', projectId);
            this.refreshProjects();
        } catch (e) { alert("Error: " + e.message); }
    }

    async manageProjectUsers(projectId, projectName) {
        const email = prompt(`Email para asignar a "${projectName}":`);
        if (!email) return;
        try {
            const { data, error } = await supabaseClient.from('user_profiles').select('id').eq('email', email).single();
            if (error || !data) return alert("Usuario no encontrado.");
            const { error: ae } = await supabaseClient.from('project_assignments').insert({ project_id: projectId, user_id: data.id });
            if (ae) alert(ae.code === '23505' ? "Ya asignado." : ae.message); else alert("Asignado.");
        } catch (e) { alert("Error: " + e.message); }
    }

    async refreshNodeTypes() {
        const list = document.getElementById('admin-node-types-list');
        list.innerHTML = 'Cargando...';
        try {
            const { data: types, error } = await supabaseClient.from('node_types').select('*').order('name');
            if (error) throw error;
            list.innerHTML = '';
            types.forEach(t => {
                const div = document.createElement('div');
                div.style.border = '1px solid #eee'; div.style.padding = '10px'; div.style.marginBottom = '5px';
                div.style.borderRadius = '4px'; div.style.backgroundColor = '#fff';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:${t.color}">●</span> <strong>${t.name}</strong>
                            <div style="font-size:11px; color:#666;">Campos: ${t.fields.map(f => f.name).join(', ') || 'Básico'}</div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-secondary" style="padding:2px 5px; font-size:11px;" onclick='window.adminManager.openEditNodeTypeModal(${JSON.stringify(t)})'>✏️</button>
                            <button class="btn-danger" style="padding:2px 5px; font-size:11px;" onclick="window.adminManager.deleteNodeType('${t.id}')">🗑️</button>
                        </div>
                    </div>`;
                list.appendChild(div);
            });
        } catch (e) { list.innerHTML = `<p style="color:red">Error: ${e.message}</p>`; }
    }

    async deleteNodeType(id) {
        if (!confirm("¿Eliminar tipo de nodo?")) return;
        const { error } = await supabaseClient.from('node_types').delete().eq('id', id);
        if (error) alert(error.message); else this.refreshNodeTypes();
    }

    openCreateNodeTypeModal() {
        this.newNodeType = { name: '', color: '#95a5a6', fields: [], isRackable: false };
        this.renderCreateNodeTypeModal("Nuevo Tipo de Nodo");
    }

    openEditNodeTypeModal(type) {
        this.newNodeType = { ...type, isRackable: type.is_rackable || false };
        this.renderCreateNodeTypeModal("Editar Tipo de Nodo");
        this.updateNodeTypeFieldsList();
    }

    renderCreateNodeTypeModal(title) {
        const modal = document.createElement('div');
        modal.id = 'modal-create-node-type'; modal.className = 'modal-overlay'; modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px;">
                <h3>${title}</h3>
                <div class="form-group">
                    <label class="form-label">Nombre del Tipo</label>
                    <input type="text" id="nt-name" class="form-input" placeholder="Ej: NAP_VIP" value="${this.newNodeType.name}">
                </div>
                <div class="form-group">
                    <label class="form-label">Color de Icono</label>
                    <input type="color" id="nt-color" class="form-input" value="${this.newNodeType.color}">
                </div>
                <div class="form-group" style="display:flex; align-items:center; gap:10px; background:#f8f9fa; padding:10px; border-radius:4px; margin-top:10px;">
                    <input type="checkbox" id="nt-rackable" ${this.newNodeType.isRackable ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                    <label for="nt-rackable" style="cursor:pointer; font-size:14px; font-weight:500; color:var(--primary-color);">📦 Es Rackeable (puede estar dentro de un Rack)</label>
                </div>
                <div style="margin-top:20px; border-top:1px solid #eee; padding-top:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>Campos Dinámicos</strong>
                        <button class="btn-secondary" style="padding:2px 10px; font-size:12px;" onclick="window.adminManager.addNodeTypeField()">+ Agregar Campo</button>
                    </div>
                    <div id="nt-fields-list" style="margin-top:10px;"></div>
                </div>
                <div class="form-actions" style="margin-top:20px;">
                    <button class="btn-secondary" onclick="document.body.removeChild(document.getElementById('modal-create-node-type'))">Cancelar</button>
                    <button class="action-btn" onclick="window.adminManager.saveNodeType()">Guardar Tipo</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    addNodeTypeField() {
        const name = prompt("Nombre del campo:");
        if (!name) return;
        const typeHtml = `
            <div id="field-type-selector" class="modal-overlay" style="z-index:3100;">
                <div class="modal-content" style="max-width:300px;">
                    <h4>Tipo para "${name}"</h4>
                    <select id="nt-field-type-select" class="form-select" style="margin-bottom:15px;">
                        <option value="text">Texto Corto</option>
                        <option value="textarea">Texto Largo</option>
                        <option value="number">Número</option>
                        <option value="select">Lista de Opciones (Menu)</option>
                        <option value="address">Dirección</option>
                        <option value="ports">Puertos de Red</option>
                        <option value="splitter">Splitter</option>
                        <option value="rack">Rack / Equipos</option>
                    </select>
                    <div class="form-actions">
                        <button class="btn-secondary" onclick="document.body.removeChild(document.getElementById('field-type-selector'))">Cancelar</button>
                        <button class="action-btn" id="btn-confirm-field-type">Confirmar</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', typeHtml);
        document.getElementById('btn-confirm-field-type').onclick = () => {
            const type = document.getElementById('nt-field-type-select').value;
            let options = null;
            if (type === 'select') {
                const optStr = prompt("Ingrese las opciones separadas por coma (ej: UTP, Interior, Exterior):");
                if (optStr) options = optStr.split(',').map(o => o.trim());
            }
            this.newNodeType.fields.push({ name, type, options });
            document.body.removeChild(document.getElementById('field-type-selector'));
            this.updateNodeTypeFieldsList();
        };
    }

    updateNodeTypeFieldsList() {
        const list = document.getElementById('nt-fields-list');
        if (!list) return;
        list.innerHTML = '';
        this.newNodeType.fields.forEach((f, idx) => {
            const item = document.createElement('div');
            item.style = 'display:flex; justify-content:space-between; padding:5px; background:#f9f9f9; margin-bottom:2px; font-size:12px;';
            item.innerHTML = `<span><strong>${f.name}</strong> (${f.type})</span><button style="border:none; background:none; cursor:pointer;" onclick="window.adminManager.removeNodeTypeField(${idx})">❌</button>`;
            list.appendChild(item);
        });
    }

    removeNodeTypeField(idx) {
        this.newNodeType.fields.splice(idx, 1);
        this.updateNodeTypeFieldsList();
    }

    async saveNodeType() {
        const name = document.getElementById('nt-name').value.trim();
        const color = document.getElementById('nt-color').value;
        const isRackable = document.getElementById('nt-rackable').checked;
        if (!name) return alert("Nombre requerido");
        try {
            const typeData = {
                name: name.toUpperCase(),
                color,
                fields: this.newNodeType.fields,
                is_rackable: isRackable
            };
            let error;
            if (this.newNodeType.id) {
                const { error: e } = await supabaseClient.from('node_types').update(typeData).eq('id', this.newNodeType.id);
                error = e;
            } else {
                const { error: e } = await supabaseClient.from('node_types').insert(typeData);
                error = e;
            }
            if (error) throw error;
            alert("Tipo de nodo guardado exitosamente");
            document.body.removeChild(document.getElementById('modal-create-node-type'));
            this.refreshNodeTypes();
            if (window.uiManager) window.uiManager.loadCustomNodeTypes();
        } catch (e) {
            console.error("Error saving node type:", e);
            alert("Error al guardar tipo: " + (e.message || "Error desconocido"));
        }
    }

    // --- Cable Types Management ---
    async refreshCableTypes() {
        const list = document.getElementById('admin-cable-types-list');
        if (!list) return;
        list.innerHTML = 'Cargando tipos de cable...';
        try {
            const { data, error } = await supabaseClient.from('cable_types').select('*').order('name');
            if (error) throw error;
            this.renderCableTypes(data || []);
        } catch (e) {
            list.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    renderCableTypes(types) {
        const list = document.getElementById('admin-cable-types-list');
        if (types.length === 0) {
            list.innerHTML = '<p style="padding:10px; color:#666;">No hay tipos de cable configurados.</p>';
            return;
        }

        let html = `
            <table style="width:100%; font-size:13px; border-collapse: collapse; margin-top:10px;">
                <thead style="background:#f5f5f5; text-align:left;">
                    <tr>
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Nombre</th>
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Medio</th>
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Hilos/Pares</th>
                        <th style="padding:8px; border-bottom:1px solid #ddd;">Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        types.forEach(t => {
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:8px;"><strong>${t.name}</strong><br><small style="color:#666">${t.category || ''} ${t.is_exterior ? '(Ext)' : '(Int)'}</small></td>
                    <td style="padding:8px;">${t.media_type}</td>
                    <td style="padding:8px;">${t.threads_count}</td>
                    <td style="padding:8px;">
                        <button class="btn-secondary" style="padding:2px 6px; font-size:11px;" onclick='window.adminManager.openEditCableTypeModal(${JSON.stringify(t)})'>✏️</button>
                        <button class="btn-danger" style="padding:2px 6px; font-size:11px;" onclick="window.adminManager.deleteCableType('${t.id}')">🗑️</button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        list.innerHTML = html;
    }

    openCreateCableTypeModal() {
        this.newCableType = { name: '', media_type: 'FIBRA', category: '', threads_count: 12, is_exterior: true };
        this.renderCreateCableTypeModal("Nuevo Tipo de Cable");
    }

    openEditCableTypeModal(type) {
        this.newCableType = { ...type };
        this.renderCreateCableTypeModal("Editar Tipo de Cable");
    }

    renderCreateCableTypeModal(title) {
        const modal = document.createElement('div');
        modal.id = 'modal-create-cable-type';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '3000';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:450px;">
                <h3>${title}</h3>
                <div class="form-group">
                    <label class="form-label">Nombre del Cable</label>
                    <input type="text" id="ct-name" class="form-input" placeholder="Ej: ADSS FIBRA" value="${this.newCableType.name}">
                </div>
                <div style="display:flex; gap:10px;">
                    <div class="form-group" style="flex:1">
                        <label class="form-label">Medio</label>
                        <select id="ct-media" class="form-select">
                            <option value="FIBRA" ${this.newCableType.media_type === 'FIBRA' ? 'selected' : ''}>Fibra Óptica</option>
                            <option value="UTP" ${this.newCableType.media_type === 'UTP' ? 'selected' : ''}>Par Trenzado (UTP)</option>
                            <option value="SIAMEZ" ${this.newCableType.media_type === 'SIAMEZ' ? 'selected' : ''}>Siamez/Híbrido</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:1">
                        <label class="form-label">Hilos / Pares</label>
                        <input type="number" id="ct-threads" class="form-input" value="${this.newCableType.threads_count}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Categoría / Norma</label>
                    <input type="text" id="ct-category" class="form-input" placeholder="Ej: Cat 6, G.652D" value="${this.newCableType.category || ''}">
                </div>
                <div class="form-group" style="display:flex; align-items:center; gap:10px; background:#f8f9fa; padding:10px; border-radius:4px;">
                    <input type="checkbox" id="ct-exterior" ${this.newCableType.is_exterior ? 'checked' : ''} style="width:18px; height:18px;">
                    <label for="ct-exterior" style="cursor:pointer; font-size:14px;">Apto para Exterior (Aéreo/Subterráneo)</label>
                </div>

                <div class="form-actions" style="margin-top:20px;">
                    <button class="btn-secondary" onclick="document.body.removeChild(document.getElementById('modal-create-cable-type'))">Cancelar</button>
                    <button class="action-btn" onclick="window.adminManager.saveCableType()">Guardar Cable</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    async saveCableType() {
        const name = document.getElementById('ct-name').value.trim();
        const media = document.getElementById('ct-media').value;
        const threads = parseInt(document.getElementById('ct-threads').value);
        const category = document.getElementById('ct-category').value.trim();
        const exterior = document.getElementById('ct-exterior').checked;

        if (!name) return alert("Nombre requerido");
        if (isNaN(threads) || threads < 1) return alert("Cantidad de hilos no válida");

        try {
            const cableData = {
                name: name.toUpperCase(),
                media_type: media,
                threads_count: threads,
                category: category,
                is_exterior: exterior
            };

            let error;
            if (this.newCableType.id) {
                const { error: e } = await supabaseClient.from('cable_types').update(cableData).eq('id', this.newCableType.id);
                error = e;
            } else {
                const { error: e } = await supabaseClient.from('cable_types').insert(cableData);
                error = e;
            }

            if (error) throw error;
            alert("Tipo de cable guardado exitosamente");
            document.body.removeChild(document.getElementById('modal-create-cable-type'));
            this.refreshCableTypes();
            if (window.uiManager) window.uiManager.loadCableTypes();
        } catch (e) {
            alert("Error al guardar tipo: " + e.message);
        }
    }

    async renderMasterListItems() {
        const container = document.getElementById('admin-master-list-items-container');
        if (!this.activeListId) return;

        try {
            const { data: list, error: lError } = await supabaseClient.from('master_lists').select('*').eq('id', this.activeListId).single();
            const { data: items, error: iError } = await supabaseClient.from('master_list_items').select('*').eq('list_id', this.activeListId).order('sort_order');

            if (lError || iError) throw (lError || iError);

            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h5 style="margin:0;">Elementos de: ${list.name}</h5>
                    <button class="action-btn" style="width:auto; padding:3px 8px; font-size:11px; background:#2ecc71;" 
                            onclick="window.adminManager.renderMasterListItemModal('${list.id}')">+ Nuevo Item</button>
                </div>
                <table style="width:100%; font-size:12px; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f9f9f9; text-align:left;">
                            <th style="padding:5px; border-bottom:1px solid #eee;">Valor (Key)</th>
                            <th style="padding:5px; border-bottom:1px solid #eee;">Etiqueta (Display)</th>
                            <th style="padding:5px; border-bottom:1px solid #eee;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(item => {
                html += `
                    <tr>
                        <td style="padding:5px; border-bottom:1px solid #eee;">${item.value}</td>
                        <td style="padding:5px; border-bottom:1px solid #eee;">${item.label}</td>
                        <td style="padding:5px; border-bottom:1px solid #eee;">
                            <button class="btn-secondary" style="padding:2px 5px; font-size:10px;" onclick="window.adminManager.editMasterListItem('${item.id}')">✏️</button>
                            <button class="btn-danger" style="padding:2px 5px; font-size:10px;" onclick="window.adminManager.deleteMasterListItem('${item.id}')">🗑️</button>
                        </td>
                    </tr>`;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    async refreshMasterLists() {
        const sidebar = document.getElementById('admin-master-lists-sidebar');
        const container = document.getElementById('admin-master-list-items-container');
        if (!sidebar || !container) return;

        try {
            const { data: lists, error } = await supabaseClient.from('master_lists').select('*').order('name');
            if (error) throw error;

            let html = '<div style="display:flex; flex-direction:column; gap:5px;">';
            lists.forEach(l => {
                const isActive = this.activeListId === l.id;
                html += `
                    <button class="${isActive ? 'action-btn' : 'btn-secondary'}" 
                            style="text-align:left; font-size:12px; padding:8px;" 
                            onclick="window.adminManager.selectMasterList('${l.id}')">
                        ${l.name}
                    </button>`;
            });
            html += '</div>';
            sidebar.innerHTML = html;

            if (this.activeListId) {
                this.renderMasterListItems();
            }
        } catch (e) {
            sidebar.innerHTML = `<p style="color:red; font-size:11px;">Error: ${e.message}</p>`;
        }
    }

    async selectMasterList(id) {
        this.activeListId = id;
        this.refreshMasterLists();
    }

    async refreshInfrastructureLists() {
        const nodesContainer = document.getElementById('admin-list-nodes-container');
        const connsContainer = document.getElementById('admin-list-conns-container');
        if (!nodesContainer || !connsContainer) return;

        const currentProjectId = window.userManager && window.userManager.currentProject ? window.userManager.currentProject.id : null;
        if (!currentProjectId) {
            nodesContainer.innerHTML = '<p style="padding:10px; color:orange;">Selecciona un proyecto primero para ver sus elementos.</p>';
            connsContainer.innerHTML = '';
            return;
        }

        nodesContainer.innerHTML = 'Cargando nodos...';
        connsContainer.innerHTML = 'Cargando cables...';

        try {
            const { data: nodes, error: nodeError } = await supabaseClient.from('nodes').select('*').eq('project_id', currentProjectId).order('name');
            const { data: conns, error: connError } = await supabaseClient.from('connections').select('*').eq('project_id', currentProjectId);

            if (nodeError) throw nodeError;
            if (connError) throw connError;

            this.renderAdminNodesList(nodes);
            this.renderAdminConnsList(conns, nodes);
        } catch (e) {
            nodesContainer.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
    }

    switchListSubTab(tab) {
        document.getElementById('admin-list-master-container').classList.toggle('hidden', tab !== 'master');
        document.getElementById('admin-list-infra-container').classList.toggle('hidden', tab !== 'infra');

        document.getElementById('tab-list-master').className = tab === 'master' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-list-infra').className = tab === 'infra' ? 'action-btn' : 'btn-secondary';

        if (tab === 'master') this.refreshMasterLists();
        if (tab === 'infra') {
            this.switchInfraTab('nodes');
            this.refreshInfrastructureLists();
        }
    }

    switchInfraTab(tab) {
        document.getElementById('admin-list-nodes-container').classList.toggle('hidden', tab !== 'nodes');
        document.getElementById('admin-list-conns-container').classList.toggle('hidden', tab !== 'conns');

        document.getElementById('tab-infra-nodes').className = tab === 'nodes' ? 'action-btn' : 'btn-secondary';
        document.getElementById('tab-infra-conns').className = tab === 'conns' ? 'action-btn' : 'btn-secondary';
    }

    renderAdminNodesList(nodes) {
        const container = document.getElementById('admin-list-nodes-container');
        if (!nodes || nodes.length === 0) {
            container.innerHTML = '<p style="padding:10px; color:#666;">No hay nodos en este proyecto.</p>';
            return;
        }

        let html = `
            <table style="width:100%; font-size:12px; border-collapse: collapse; margin-top:5px;">
                <thead style="background:#f5f5f5; text-align:left;">
                    <tr>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Nombre</th>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Tipo</th>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        nodes.forEach(n => {
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:5px;">${n.name}</td>
                    <td style="padding:5px;">${n.type}</td>
                    <td style="padding:5px;">
                        <button class="btn-danger" style="padding:2px 5px; font-size:10px;" onclick="window.adminManager.deleteNodeFromList('${n.id}')">🗑️</button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    renderAdminConnsList(conns, nodes) {
        const container = document.getElementById('admin-list-conns-container');
        if (!conns || conns.length === 0) {
            container.innerHTML = '<p style="padding:10px; color:#666;">No hay cables en este proyecto.</p>';
            return;
        }

        let html = `
            <table style="width:100%; font-size:12px; border-collapse: collapse; margin-top:5px;">
                <thead style="background:#f5f5f5; text-align:left;">
                    <tr>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Origen / Destino</th>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Tipo</th>
                        <th style="padding:5px; border-bottom:1px solid #ddd;">Acciones</th>
                    </tr>
                </thead>
                <tbody>`;

        conns.forEach(c => {
            const fromNode = nodes.find(n => n.id === c.from);
            const toNode = nodes.find(n => n.id === c.to);
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:5px;">
                        ${fromNode ? fromNode.name : '?'}<br>
                        ${toNode ? toNode.name : '?'}
                    </td>
                    <td style="padding:5px;">${c.cableType || 'DROP'}<br><small>${c.fibers} hilos</small></td>
                    <td style="padding:5px;">
                        <button class="btn-danger" style="padding:2px 5px; font-size:10px;" onclick="window.adminManager.deleteConnFromList('${c.id}')">🗑️</button>
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    async renderMasterListItemModal(listId, item = null) {
        const isEditing = !!item;
        const { data: listData } = await supabaseClient.from('master_lists').select('name').eq('id', listId).single();
        const isRoleList = listData && listData.name === 'Roles de Usuario';
        const isRackEquipList = listData && listData.name === 'Tipos de Equipo Rack';

        const perms = item ? (item.permissions || {}) : {};

        const modal = document.createElement('div');
        modal.id = 'modal-master-list-item';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '3500';

        let valueFieldHtml = `<input type="text" id="mli-value" class="form-input" value="${item ? item.value : ''}" ${isEditing ? 'disabled' : ''}>`;

        if (isRackEquipList && !isEditing) {
            // Dropdown of rackable node types
            const { data: nodeTypes } = await supabaseClient.from('node_types').select('name').eq('is_rackable', true).order('name');
            valueFieldHtml = `
                <select id="mli-value" class="form-select">
                    <option value="">Seleccione tipo de nodo...</option>
                    ${(nodeTypes || []).map(nt => `<option value="${nt.name}">${nt.name}</option>`).join('')}
                </select>`;
        }

        let permissionsHtml = '';
        if (isRoleList) {
            // ... (keep the permissions editor)
            const availablePerms = [
                { id: 'view_admin', label: 'Acceso a Panel Admin' },
                { id: 'edit_admin_settings', label: 'Editar Tipos/Listas (Admin Settings)' },
                { id: 'manage_all_users', label: 'Gestionar todos los usuarios' },
                { id: 'view_all_projects', label: 'Ver todos los proyectos' },
                { id: 'edit_inventory', label: 'Editar Inventario (Nodos/Cables)' },
                { id: 'create_reports', label: 'Crear Reportes de Daño' },
                { id: 'resolve_reports', label: 'Resolver Reportes de Daño' },
                { id: 'is_restricted_view', label: 'Vista Restringida (Solo infraestructura asignada)' }
            ];

            permissionsHtml = `
                <div style="margin-top:15px; background:#f8f9fa; padding:10px; border-radius:4px; max-height:200px; overflow-y:auto;">
                    <label style="font-weight:600; display:block; margin-bottom:8px;">Permisos del Rol:</label>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        ${availablePerms.map(p => `
                            <div style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="perm-${p.id}" ${perms[p.id] ? 'checked' : ''} style="width:16px; height:16px;">
                                <label for="perm-${p.id}" style="font-size:12px; cursor:pointer;">${p.label}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; padding:20px;">
                <h3>${isEditing ? 'Editar Elemento' : 'Nuevo Elemento'}</h3>
                <div class="form-group">
                    <label class="form-label">${isRackEquipList ? 'Tipo de Nodo Rackeable' : 'Valor (ID/Key)'}</label>
                    ${valueFieldHtml}
                </div>
                <div class="form-group">
                    <label class="form-label">Etiqueta (Display)</label>
                    <input type="text" id="mli-label" class="form-input" value="${item ? item.label : ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Orden (Prioridad)</label>
                    <input type="number" id="mli-sort" class="form-input" value="${item ? item.sort_order : '0'}">
                </div>
                ${permissionsHtml}
                <div class="form-actions" style="margin-top:20px;">
                    <button class="btn-secondary" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Cancelar</button>
                    <button class="action-btn" id="btn-save-master-item">Guardar</button>
                </div>
            </div>`;

        document.body.appendChild(modal);

        if (isRackEquipList && !isEditing) {
            const valSelect = document.getElementById('mli-value');
            const labInput = document.getElementById('mli-label');
            valSelect.onchange = () => {
                if (valSelect.value) labInput.value = valSelect.value;
            };
        }

        document.getElementById('btn-save-master-item').onclick = async () => {
            const val = document.getElementById('mli-value').value.trim();
            const lab = document.getElementById('mli-label').value.trim();
            const sort = parseInt(document.getElementById('mli-sort').value) || 0;

            if (!val || !lab) return alert("Faltan campos requeridos");

            const itemPerms = {};
            if (isRoleList) {
                const pIds = ['view_admin', 'edit_admin_settings', 'manage_all_users', 'view_all_projects', 'edit_inventory', 'create_reports', 'resolve_reports', 'is_restricted_view'];
                pIds.forEach(p => {
                    itemPerms[p] = document.getElementById(`perm-${p}`).checked;
                });
            }

            const payload = {
                list_id: listId,
                value: val,
                label: lab,
                sort_order: sort,
                permissions: itemPerms
            };

            try {
                let error;
                if (isEditing) {
                    const { error: e } = await supabaseClient.from('master_list_items').update(payload).eq('id', item.id);
                    error = e;
                } else {
                    const { error: e } = await supabaseClient.from('master_list_items').insert(payload);
                    error = e;
                }

                if (error) throw error;
                document.body.removeChild(modal);
                this.renderMasterListItems();
                if (window.uiManager) window.uiManager.loadMasterLists();
            } catch (e) {
                alert("Error: " + e.message);
            }
        };
    }

    async editMasterListItem(itemId) {
        try {
            const { data: item, error } = await supabaseClient.from('master_list_items').select('*').eq('id', itemId).single();
            if (error) throw error;
            this.renderMasterListItemModal(item.list_id, item);
        } catch (e) { alert("Error: " + e.message); }
    }

    async deleteMasterListItem(itemId) {
        if (!confirm("¿Eliminar este elemento?")) return;
        try {
            const { error } = await supabaseClient.from('master_list_items').delete().eq('id', itemId);
            if (error) throw error;
            this.renderMasterListItems();
            if (window.uiManager) window.uiManager.loadMasterLists();
        } catch (e) { alert("Error: " + e.message); }
    }

    async deleteCableType(id) {
        if (!confirm("¿Eliminar este tipo de cable? Puede afectar conexiones existentes.")) return;
        try {
            const { error } = await supabaseClient.from('cable_types').delete().eq('id', id);
            if (error) throw error;
            this.refreshCableTypes();
            if (window.uiManager) window.uiManager.loadCableTypes();
        } catch (e) {
            alert("Error al eliminar: " + e.message);
        }
    }

    async deleteNodeFromList(id) {
        if (!confirm("¿Seguro que deseas eliminar este nodo? Se eliminarán también sus conexiones.")) return;
        try {
            const { error } = await supabaseClient.from('nodes').delete().eq('id', id);
            if (error) throw error;
            this.refreshLists();
            if (window.inventoryManager && window.userManager.currentProject) {
                window.inventoryManager.init(window.userManager.currentProject.id);
            }
        } catch (e) { alert("Error: " + e.message); }
    }

    async deleteConnFromList(id) {
        if (!confirm("¿Seguro que deseas eliminar esta conexión?")) return;
        try {
            const { error } = await supabaseClient.from('connections').delete().eq('id', id);
            if (error) throw error;
            this.refreshLists();
            if (window.inventoryManager && window.userManager.currentProject) {
                window.inventoryManager.init(window.userManager.currentProject.id);
            }
        } catch (e) { alert("Error: " + e.message); }
    }
}

class InventoryManager {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.projectId = null;
    }

    async checkAdminLock() {
        if (!this.projectId) return false;
        try {
            const { data, error } = await supabaseClient
                .from('projects')
                .select('admin_lock_user, admin_lock_timestamp')
                .eq('id', this.projectId)
                .single();

            if (error || !data || !data.admin_lock_user) return false;

            const lockTime = new Date(data.admin_lock_timestamp);
            const now = new Date();
            const diff = (now - lockTime) / 1000 / 60; // minutes

            if (diff < 15) { // Same timeout as AdminManager
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (user && user.id !== data.admin_lock_user) {
                    return true;
                }
            }
        } catch (e) {
            console.error("Lock check failed:", e);
        }
        return false;
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
        if (!this.projectId) {
            alert("No hay un proyecto activo. Por favor selecciona o crea un proyecto primero.");
            return null;
        }
        if (await this.checkAdminLock()) {
            alert("⚠️ No se puede agregar el nodo: Un administrador está realizando cambios en el panel administrativo.");
            return null;
        }
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
                reserve: node.reserve || 0,
                lat: node.lat,
                lng: node.lng,
                rack: node.rack || [],
                splitters: node.splitters || [],
                clientData: node.clientData || null,
                damageReports: node.damageReports || [],
                customFields: node.customFields || {},
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
        if (await this.checkAdminLock()) {
            alert("⚠️ No se puede actualizar el nodo: Un administrador está realizando cambios en el panel administrativo.");
            return;
        }
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
                    reserve: updatedNode.reserve || 0,
                    lat: updatedNode.lat,
                    lng: updatedNode.lng,
                    rack: updatedNode.rack || [],
                    splitters: updatedNode.splitters || [],
                    clientData: updatedNode.clientData || null,
                    damageReports: updatedNode.damageReports || [],
                    customFields: updatedNode.customFields || {},
                    project_id: this.projectId
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
        if (await this.checkAdminLock()) {
            alert("⚠️ No se puede eliminar el nodo: Un administrador está realizando cambios en el panel administrativo.");
            return;
        }
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

    async getConnectionsIntersectingNode(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return [];
        return this.connections.filter(c => {
            if (c.from === nodeId || c.to === nodeId) return true;
            // Precise check if node coordinates are in the path
            if (c.path && Array.isArray(c.path)) {
                return c.path.some(p => Math.abs(p[0] - node.lat) < 0.000001 && Math.abs(p[1] - node.lng) < 0.000001);
            }
            return false;
        });
    }

    getConnections() {
        return this.connections;
    }
    async addConnection(fromId, toId, path, cableType, fibers, fromPort, toPort, sectionType, identification, plano_id = null) {
        if (!this.projectId) {
            alert("No hay un proyecto activo. Por favor selecciona o crea un proyecto primero.");
            return null;
        }
        if (await this.checkAdminLock()) {
            alert("⚠️ No se puede crear la conexión: Un administrador está realizando cambios en el panel administrativo.");
            return null;
        }

        const fDetails = this.initializeFiberDetails(parseInt(fibers));
        if (plano_id && fDetails.length > 0) {
            // Assign plano_id to all fibers of this cable
            fDetails.forEach(f => f.plano_id = plano_id);
        }

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
            identification: identification || null,
            fiberDetails: fDetails, // Initialize fiber array
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
        if (await this.checkAdminLock()) {
            alert("⚠️ No se puede eliminar la conexión: Un administrador está realizando cambios en el panel administrativo.");
            return;
        }
        const index = this.connections.findIndex(c => c.id === id);
        if (index !== -1) {
            this.connections.splice(index, 1);
            try {
                const { error } = await supabaseClient.from('connections').delete().eq('id', id);
                if (error) throw error;
            } catch (e) {
                console.error('Error deleting connection:', e);
            }
        }
    }

    async splitConnection(connectionId, newNodeId, splitLatLng) {
        if (await this.checkAdminLock()) return null;

        const original = this.connections.find(c => c.id === connectionId);
        if (!original) return null;

        const newNode = this.getNode(newNodeId);
        if (!newNode) return null;

        // Find closest point in path to split point
        let closestIdx = 0;
        let minDist = Infinity;
        original.path.forEach((p, idx) => {
            const d = L.latLng(p[0], p[1]).distanceTo(L.latLng(splitLatLng.lat, splitLatLng.lng));
            if (d < minDist) {
                minDist = d;
                closestIdx = idx;
            }
        });

        // Split paths
        const path1 = original.path.slice(0, closestIdx + 1);
        path1.push([newNode.lat, newNode.lng]);

        const path2 = [[newNode.lat, newNode.lng]];
        path2.push(...original.path.slice(closestIdx));

        // Create new connections
        const conn1 = await this.addConnection(
            original.from, newNodeId, path1,
            original.cableType, original.fibers,
            original.fromPort, null, original.sectionType
        );

        const conn2 = await this.addConnection(
            newNodeId, original.to, path2,
            original.cableType, original.fibers,
            null, original.toPort, original.sectionType
        );

        // Delete original
        await this.deleteConnection(connectionId);

        return { conn1, conn2 };
    }

    // This is a helper for when splitting isn't used, but nodes are near a cable
    getIntermediateReserves(connection) {
        let total = 0;
        const radius = 10; // 10 meters tolerance

        this.nodes.forEach(node => {
            // Skip endpoints
            if (node.id === connection.from || node.id === connection.to) return;

            // Basic proximity check: is the node close to any point in the path or segment?
            const nodeLatLng = L.latLng(node.lat, node.lng);
            let isNear = false;

            for (let i = 0; i < connection.path.length - 1; i++) {
                const p1 = L.latLng(connection.path[i][0], connection.path[i][1]);
                const p2 = L.latLng(connection.path[i + 1][0], connection.path[i + 1][1]);

                // Leaflet GeometryUtil or similar would be better, but we do a simple check
                // for distance to segment
                const dist = this._distToSegment(nodeLatLng, p1, p2);
                if (dist <= radius) {
                    isNear = true;
                    break;
                }
            }

            if (isNear) {
                total += parseFloat(node.reserve || 0);
            }
        });

        return total;
    }

    _distToSegment(p, v, w) {
        const l2 = v.distanceTo(w) * v.distanceTo(w);
        if (l2 === 0) return p.distanceTo(v);
        let t = ((p.lat - v.lat) * (w.lat - v.lat) + (p.lng - v.lng) * (w.lng - v.lng)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projection = L.latLng(v.lat + t * (w.lat - v.lat), v.lng + t * (w.lng - v.lng));
        return p.distanceTo(projection);
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

            // Initialize ports based on groups if available
            equipment.ports = [];
            let globalPortIndex = 1;

            if (equipment.portGroups && equipment.portGroups.length > 0) {
                equipment.portGroups.forEach(group => {
                    const groupQty = parseInt(group.qty || group.count || 0);
                    for (let i = 1; i <= groupQty; i++) {
                        equipment.ports.push({
                            id: `${equipment.id}-p${globalPortIndex}`,
                            number: globalPortIndex,
                            type: group.type,
                            status: 'free',
                            connectedTo: null
                        });
                        globalPortIndex++;
                    }
                });
                equipment.totalPorts = globalPortIndex - 1;
            } else {
                // Backward compatibility / Default
                for (let i = 1; i <= parseInt(equipment.totalPorts || 0); i++) {
                    equipment.ports.push({
                        id: `${equipment.id}-p${i}`,
                        number: i,
                        type: 'Generic',
                        status: 'free',
                        connectedTo: null
                    });
                }
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
        this.customNodeTypes = [];
        this.cableTypes = [];

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
        this.pendingSplitConnectionId = null;
        this._originalBtnText = { connect: '', tenderCable: '' };

        // DOM Elements
        this.views = {
            list: document.getElementById('view-list'),
            add: document.getElementById('view-add-node'),
            details: document.getElementById('view-node-details'),
            rack: document.getElementById('view-rack-details'),
            ports: document.getElementById('view-port-management'),
            connection: document.getElementById('view-connection-details'),
            splitter: document.getElementById('view-splitter-management'),
            reports: document.getElementById('view-reports'),
            inventoryMessage: document.getElementById('view-inventory-message'),
            reportsMessage: document.getElementById('view-reports-message')
        };

        // Main content elements
        this.mapContainer = document.getElementById('map');
        this.fullReportsView = document.getElementById('full-reports-view');

        // Reports filter state
        this.currentReportsFilter = 'all'; // 'all', 'pending', 'resolved'
        this.currentMainReportsFilter = 'all';

        this.connectionDetails = {
            title: document.getElementById('connection-detail-title'),
            identification: document.getElementById('conn-id-display'),
            identificationRow: document.getElementById('conn-id-row'),
            fromName: document.getElementById('conn-from-name'),
            toName: document.getElementById('conn-to-name'),
            cableType: document.getElementById('conn-cable-type-display'),
            sectionType: document.getElementById('conn-section-type-display'),
            sectionTypeRow: document.getElementById('conn-section-type-row'),
            fibers: document.getElementById('conn-fibers-display'),
            distance: document.getElementById('conn-distance-display'),
            reserve: document.getElementById('conn-total-reserve-display'),
            total: document.getElementById('conn-total-length-display'),
            btnEdit: document.getElementById('btn-edit-connection'),
            btnMapPorts: document.getElementById('btn-map-to-ports'),
            btnDelete: document.getElementById('btn-delete-connection'),
            btnClose: document.getElementById('btn-close-connection')
        };

        this.currentConnectionId = null;

        this.form = {
            form: document.getElementById('add-node-form'),
            type: document.getElementById('node-type'),
            name: document.getElementById('node-name'),
            reserve: document.getElementById('node-reserve'),
            lat: document.getElementById('node-lat'),
            lng: document.getElementById('node-lng'),
            preview: document.getElementById('location-preview'),
            clientFields: document.getElementById('client-fields'),
            clientAddress: document.getElementById('client-address'),
            clientPlan: document.getElementById('client-plan'),
            dynamicFields: document.getElementById('dynamic-fields')
        };

        this.details = {
            name: document.getElementById('detail-name'),
            type: document.getElementById('detail-type'),
            coords: document.getElementById('detail-coords'),
            reserve: document.getElementById('detail-reserve'),
            extraInfo: document.getElementById('detail-extra-info'),
            btnConnect: document.getElementById('btn-start-connection'),
            btnReport: document.getElementById('btn-report-damage'),
            btnViewRack: document.getElementById('btn-view-rack'),
            btnViewSplitters: document.getElementById('btn-view-splitters'),
            btnManagePorts: document.getElementById('btn-manage-node-ports'),
            btnRelocate: document.getElementById('btn-start-relocation'),
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
            connIdentification: document.getElementById('conn-identification'),
            equipment: document.getElementById('form-equipment'),
            connCableType: document.getElementById('conn-cable-type'),
            connSectionType: document.getElementById('conn-section-type'),
            connSectionGroup: document.getElementById('group-section-type'),
            connFibers: document.getElementById('conn-fibers'),
            connFibersGroup: document.getElementById('group-fibers'),

            equipName: document.getElementById('equip-name'),
            equipType: document.getElementById('equip-type'),
            equipPortsData: document.getElementById('equip-ports-data'),
            equipPortsList: document.getElementById('equip-ports-list'),
            equipPortType: document.getElementById('eq-pt-type'),
            equipPortQty: document.getElementById('eq-pt-qty'),
            equipIsProvider: document.getElementById('equip-is-provider'),
            equipProviderGroup: document.getElementById('equip-provider-group'),
            dynamicEquipFields: document.getElementById('dynamic-equip-fields'),
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

        // Fiber Mapping Modal
        this.mappingModal = {
            modal: document.getElementById('modal-fiber-mapping'),
            sourceNode: document.getElementById('mapping-source-node'),
            targetNode: document.getElementById('mapping-target-node'),
            fiberList: document.getElementById('fiber-mapping-list'),
            btnCancel: document.getElementById('btn-cancel-mapping'),
            btnSave: document.getElementById('btn-save-mapping')
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

        // Inventory UI
        this.fullInventoryView = document.getElementById('full-inventory-view');
        this.inventoryUI = {
            stats: document.getElementById('inventory-stats'),
            search: document.getElementById('inventory-search'),
            container: document.getElementById('inventory-container'),
            btnGrid: document.getElementById('btn-inventory-grid'),
            btnList: document.getElementById('btn-inventory-list'),
            btnClose: document.getElementById('btn-close-inventory-main'),
            filterAll: document.getElementById('inv-filter-all'),
            filterNodes: document.getElementById('inv-filter-nodes'),
            filterConns: document.getElementById('inv-filter-conns')
        };
        this.inventoryDisplayMode = 'grid'; // 'grid' or 'list'
        this.inventorySearchQuery = '';
        this.inventoryTypeFilter = 'all'; // 'all', 'node', 'connection'
        this.inventoryViewMode = 'summary'; // 'summary' or 'category'
        this.currentInventoryCategory = null; // e.g., 'NAP', 'ASU'
        this.currentInventoryType = null; // 'node' or 'connection'

        // Favorite categories (Load from localStorage)
        try {
            const savedFavs = localStorage.getItem('ultranet_favorites');
            this.favoriteCategories = savedFavs ? JSON.parse(savedFavs) : [];
        } catch (e) {
            console.error('Error parsing favorites:', e);
            this.favoriteCategories = [];
        }
    }

    async init() {
        // Setup listeners that don't depend on project
        this.setupEventListeners();
        this.setupNavigationButtons();

        // Load global types immediately so they are available even without a project
        this.loadCustomNodeTypes();
        this.loadCableTypes();
        this.loadMasterLists();
    }

    async loadProject(projectId, userRole) {
        this.userRole = userRole; // Store role for UI permissions
        await this.inventoryManager.init(projectId);
        await this.loadCustomNodeTypes();
        await this.loadCableTypes();
        this.loadExistingData();

        // Apply Role Restrictions from permissions
        const perms = (window.userManager && window.userManager.profile) ? window.userManager.profile.permissions : {};

        // Restriction: Edit Inventory
        if (perms.edit_inventory === false) {
            // Hide "Add Node" button
            const addNodeForm = document.getElementById('view-add-node');
            if (addNodeForm) addNodeForm.classList.add('hidden');

            // Hide quick action buttons
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
        Object.keys(this.views).forEach(key => {
            const el = this.views[key];
            if (el) {
                el.classList.remove('active');
                el.classList.add('hidden');
            }
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
        document.getElementById('btn-tender-cable').addEventListener('click', () => this.startStandaloneCablingFlow());
        document.getElementById('btn-locate-me').addEventListener('click', () => this.mapManager.locateUser());

        // Toggle Client Fields and Dynamic Fields
        // Toggle Client Fields and Dynamic Fields
        this.form.type.addEventListener('change', (e) => {
            const type = e.target.value;

            // Core logic for ONU
            if (type === 'ONU') {
                this.form.clientFields.classList.remove('hidden');
            } else {
                this.form.clientFields.classList.add('hidden');
            }

            // Custom Node Types logic
            this.renderDynamicFields(type);

            // Draw attention to location if not set
            if (!this.tempLocation) {
                this.form.preview.style.transform = "scale(1.05)";
                setTimeout(() => this.form.preview.style.transform = "scale(1)", 200);
                this.form.preview.style.boxShadow = "0 0 10px rgba(231, 76, 60, 0.5)";
                setTimeout(() => this.form.preview.style.boxShadow = "none", 1000);
            }
        });

        // Map Interactions
        document.addEventListener('map:clicked', (e) => {
            if (this.isAddingNode) {
                this.setFormLocation(e.detail);
            } else if (this.isRelocatingNode) {
                this.updateNodeLocation(this.isRelocatingNode, e.detail);
            } else if (this.isConnecting) {
                this.addConnectionWaypoint(e.detail);
            }
        });

        document.addEventListener('map:mousemove', (e) => {
            if (this.isConnecting && this.connectionWaypoints.length > 0) {
                // Visualize line to cursor
                const points = [...this.connectionWaypoints, [e.detail.lat, e.detail.lng]];

                if (window.planoManager && window.planoManager.isActive) {
                    window.planoManager.updateTempPolyline(points);
                } else {
                    this.mapManager.updateTempPolyline(points);
                }
            }
        });

        document.addEventListener('marker:clicked', (e) => {
            if (this.isConnecting) {
                const node = this.inventoryManager.getNode(e.detail);
                if (node) {
                    this.addConnectionWaypoint({ lat: node.lat, lng: node.lng });
                    console.log("Added node waypoint:", node.name);
                }
            } else {
                this.showNodeDetails(e.detail);
            }
        });

        document.addEventListener('connection:clicked', (e) => {
            const connId = e.detail.id;
            const latlng = e.detail.latlng;

            if (this.isAddingNode) {
                // Feature: Insert node into cable (Stay in 'add' view)
                this.pendingSplitConnectionId = connId;
                this.setFormLocation(latlng);
                console.log("Adding node into cable:", this.pendingSplitConnectionId);
            } else if (this.isConnecting && this.connectionSourceId !== null) {
                // waypoint handled by map:clicked
            } else {
                this.showConnectionDetails(connId);
            }
        });

        // Form Submit
        this.form.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveNode();
        });

        // Equipment Modal Actions
        this.modalForms.equipType.addEventListener('change', (e) => {
            this.renderDynamicEquipFields(e.target.value);
        });

        // Details Actions
        this.details.btnClose.addEventListener('click', () => {
            this.switchView('list');
            this.currentNodeId = null;
            this.mapManager.resetNetworkStyles();
        });

        this.details.btnDelete.addEventListener('click', () => {
            this.deleteCurrentNode();
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

        this.details.btnViewSplitters.addEventListener('click', () => {
            this.showSplitterView();
        });

        this.details.btnManagePorts.addEventListener('click', () => {
            const node = this.inventoryManager.getNode(this.currentNodeId);
            if (node && node.rack && node.rack.length > 0) {
                this.currentRackNodeId = this.currentNodeId;
                this.showPortView(node.rack[0].id); // Usually just one internal equip for dynamic ports
            }
        });

        this.details.btnRelocate.addEventListener('click', () => {
            if (this.currentNodeId) this.startNodeRelocation(this.currentNodeId);
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

        // Show/Hide Section Type based on Cable Type and auto-populate fiber count
        this.modalForms.connCableType.addEventListener('change', (e) => {
            const selectedOption = e.target.selectedOptions[0];
            const isDrop = e.target.value.includes('DROP');
            const mediaType = selectedOption?.dataset.media || 'FIBRA';
            const isUTP = mediaType === 'UTP';

            if (isDrop) {
                this.modalForms.connSectionGroup.classList.add('hidden');
            } else {
                this.modalForms.connSectionGroup.classList.remove('hidden');
            }

            // Hide fiber count selector for UTP (always 4 pairs)
            if (isUTP) {
                this.modalForms.connFibersGroup.classList.add('hidden');
                this.modalForms.connFibers.value = '4'; // UTP always has 4 pairs
            } else {
                this.modalForms.connFibersGroup.classList.remove('hidden');
                // Auto-populate fiber/pair count from cable type
                if (selectedOption && selectedOption.dataset.threads) {
                    this.modalForms.connFibers.value = selectedOption.dataset.threads;
                }
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
        this.connectionDetails.btnMapPorts.addEventListener('click', () => this.openFiberMappingModal());
        this.connectionDetails.btnDelete.addEventListener('click', async () => await this.deleteConnection());

        this.mappingModal.btnCancel.addEventListener('click', () => this.mappingModal.modal.classList.add('hidden'));
        this.mappingModal.btnSave.addEventListener('click', () => this.saveFiberMapping());


        const btnAddEqPort = document.getElementById('btn-add-eq-port-group');
        if (btnAddEqPort) {
            btnAddEqPort.addEventListener('click', () => this.addPortGroupToEquipField());
        }

        // Connection Details Actions
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

        // Inventory Filters
        const setInvFilter = (type) => {
            this.inventoryTypeFilter = type;
            document.querySelectorAll('.inv-filter-btn').forEach(btn => {
                btn.style.background = 'transparent';
                btn.style.fontWeight = 'normal';
            });
            const activeBtn = type === 'all' ? this.inventoryUI.filterAll :
                type === 'node' ? this.inventoryUI.filterNodes :
                    this.inventoryUI.filterConns;
            if (activeBtn) {
                activeBtn.style.background = '#fff';
                activeBtn.style.fontWeight = 'bold';
            }
            this.renderInventory();
        };

        if (this.inventoryUI.filterAll) this.inventoryUI.filterAll.addEventListener('click', () => setInvFilter('all'));
        if (this.inventoryUI.filterNodes) this.inventoryUI.filterNodes.addEventListener('click', () => setInvFilter('node'));
        if (this.inventoryUI.filterConns) this.inventoryUI.filterConns.addEventListener('click', () => setInvFilter('connection'));

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

        // Populate Equipment Types from Master Lists if available, else standard
        const select = this.modalForms.equipType;
        const currentVal = select.value || 'SWITCH';
        select.innerHTML = '';

        const standardTypes = ['OLT', 'ODF', 'SWITCH', 'ROUTER', 'SERVER', 'MEDIA_CONVERTER'];

        standardTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });

        if (Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        }

        this.modalForms.equipIsProvider.checked = false;

        // Reset Port Groups
        this.modalForms.equipPortsData.value = "[]";
        this.modalForms.equipPortsList.innerHTML = "";
    }

    addPortGroupToEquipField() {
        const type = this.modalForms.equipPortType.value;
        const qty = parseInt(this.modalForms.equipPortQty.value);
        if (!qty || qty <= 0) return;

        let groups = JSON.parse(this.modalForms.equipPortsData.value || "[]");
        groups.push({ type, qty });
        this.modalForms.equipPortsData.value = JSON.stringify(groups);

        // Update list UI
        const tag = document.createElement('span');
        tag.style = 'display:inline-block; background:#fff; border:1px solid #ccc; padding:2px 5px; margin:2px; border-radius:3px; font-size:10px;';
        tag.textContent = `${qty}x ${type}`;
        this.modalForms.equipPortsList.appendChild(tag);

        this.modalForms.equipPortQty.value = "";
    }


    // --- Add Node Flow ---
    startAddNodeFlow() {
        this.isAddingNode = true;
        this.switchView('add');
        this.resetForm();

        // Show vertical elevation fields if in plano mode
        const vFields = document.getElementById('vertical-fields');
        if (vFields) {
            if (window.planoManager && window.planoManager.isActive) {
                vFields.classList.remove('hidden');
            } else {
                vFields.classList.add('hidden');
            }
        }

        const inPlano = window.planoManager && window.planoManager.isActive;
        const msg = inPlano
            ? "📍 HAZ CLIC EN EL PLANO PARA UBICAR"
            : "📍 HAZ CLIC EN EL MAPA PARA UBICAR";
        this.form.preview.innerHTML = `<small style='color:#e74c3c; font-weight:bold;'>${msg}</small>`;
        this.form.preview.classList.remove('success');
        this.form.preview.style.borderColor = "#ff4d4f";
        this.form.preview.style.background = "#fff5f5";
    }

    cancelAddNode() {
        this.isAddingNode = false;
        this.switchView('list');
    }

    setFormLocation(latlng) {
        this.tempLocation = latlng;
        this.form.lat.value = latlng.lat;
        this.form.lng.value = latlng.lng;
        this.form.preview.innerHTML = `<span style="font-weight:bold;">✅ UBICACIÓN LISTA</span><br><small>${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</small>`;
        this.form.preview.classList.add('success');
        this.form.preview.style.borderColor = "#2ecc71";
        this.form.preview.style.background = "#f0fff4";
    }

    async saveNode() {
        if (!this.tempLocation) {
            alert("Por favor selecciona una ubicación en el mapa.");
            return;
        }

        const newNode = {
            id: Date.now().toString(),
            type: this.form.type.value,
            name: this.form.name.value.trim(),
            reserve: parseFloat(this.form.reserve.value) || 0,
            lat: parseFloat(this.form.lat.value),
            lng: parseFloat(this.form.lng.value),
            rack: []
        };

        // Capture elevation if available
        const heightInput = document.getElementById('node-height');
        if (heightInput) {
            newNode.customFields = newNode.customFields || {};
            newNode.customFields.height = parseFloat(heightInput.value) || 0;
        }

        // ONU-specific legacy support - mostly handled by dynamic fields now
        if (newNode.type === 'ONU' && this.form.clientAddress && this.form.clientPlan) {
            const addr = this.form.clientAddress.value;
            const plan = this.form.clientPlan.value;
            if (addr || plan) {
                newNode.clientData = { address: addr, plan: plan };
            }
        }

        // Capture Dynamic Fields
        const customType = this.customNodeTypes.find(t => t.name === newNode.type);
        if (customType) {
            newNode.customFields = {};
            customType.fields.forEach(f => {
                const safeName = f.name.replace(/[^a-z0-9]/gi, '_');
                const input = document.getElementById(`dynamic-field-${safeName}`);
                if (input) {
                    let val = input.value;
                    if (f.type === 'ports') {
                        try {
                            const groups = JSON.parse(val || "[]");
                            if (groups.length > 0) {
                                const equip = {
                                    id: 'equip-' + Math.random().toString(36).substr(2, 9),
                                    name: f.name,
                                    type: 'INTERNO',
                                    ports: []
                                };
                                let portCount = 1;
                                groups.forEach(g => {
                                    for (let i = 0; i < g.qty; i++) {
                                        equip.ports.push({
                                            id: `p${portCount++}`,
                                            type: g.type,
                                            label: `${g.type}-${i + 1}`,
                                            status: 'available'
                                        });
                                    }
                                });
                                newNode.rack.push(equip);
                                val = groups; // Store as array in customFields
                            }
                        } catch (e) { console.warn("Error parsing ports", e); }
                    }
                    newNode.customFields[f.name] = val;
                }
            });
        }

        // Inject plano_id if in plano mode
        if (window.planoManager && window.planoManager.isActive && window.planoManager.fullPlanoId) {
            newNode.customFields = newNode.customFields || {};
            newNode.customFields.plano_id = window.planoManager.fullPlanoId;
        }

        const addedNode = await this.inventoryManager.addNode(newNode);

        if (addedNode) {
            // Handle Split if necessary
            if (this.pendingSplitConnectionId) {
                await this.inventoryManager.splitConnection(this.pendingSplitConnectionId, addedNode.id, this.tempLocation);
                this.pendingSplitConnectionId = null;
                // Important: refresh selectable connections on map
                if (window.planoManager && window.planoManager.isActive) {
                    window.planoManager._renderPlanoElementsToMap();
                } else {
                    this.mapManager.refreshAllConnections(this.inventoryManager);
                }
            }

            if (window.planoManager && window.planoManager.isActive) {
                window.planoManager._renderPlanoElementsToMap();
            } else {
                this.mapManager.addMarker(addedNode);
                this.mapManager.refreshAllMarkers(this.inventoryManager); // Refresh to show new segments
                this.mapManager.resetNetworkStyles();
            }

            this.isAddingNode = false;
            this.tempLocation = null;
            this.switchView('list');
            this.refreshNodeList();
        }
    }

    startNodeRelocation(nodeId) {
        const node = this.inventoryManager.getNode(nodeId);
        if (!node) return;
        alert(`Modo Reubicación: Haz clic en el nuevo punto del mapa para mover "${node.name}".`);
        this.isRelocatingNode = nodeId;
    }

    async updateNodeLocation(nodeId, latlng) {
        if (!confirm("¿Mover este nodo a la nueva ubicación?")) return;
        try {
            const { error } = await supabaseClient.from('nodes').update({ lat: latlng.lat, lng: latlng.lng }).eq('id', nodeId);
            if (error) throw error;

            // Update local data
            const node = this.inventoryManager.getNode(nodeId);
            if (node) {
                node.lat = latlng.lat;
                node.lng = latlng.lng;
            }

            // Update marker
            this.mapManager.updateMarker(nodeId, latlng);
            this.isRelocatingNode = null;
            this.showNodeDetails(nodeId);
            alert("Ubicación actualizada correctamente.");
        } catch (e) { alert("Error al mover: " + e.message); }
    }

    // --- Connection Flow ---
    async startStandaloneCablingFlow() {
        if (await this.inventoryManager.checkAdminLock()) {
            alert("⚠️ No se puede iniciar el tendido: Un administrador está realizando cambios.");
            return;
        }

        // If a previous connection was in progress, clean it up first
        if (this.isConnecting) {
            this.mapManager.clearTempPolyline();
            if (window.planoManager && window.planoManager.isActive) {
                window.planoManager.clearTempPolyline();
            }
            this.removeStandaloneClosureUI();
        }

        this.isConnecting = true;
        this.connectionSourceId = null;
        this.connectionWaypoints = [];
        this.selectedSourcePort = null;
        this.selectedTargetPort = null;
        this.mapManager.clearTempPolyline();
        if (window.planoManager && window.planoManager.isActive) {
            window.planoManager.clearTempPolyline();
        }

        const btn = document.getElementById('btn-tender-cable');
        this._originalBtnText.tenderCable = btn.textContent;
        btn.textContent = "Modo Trazado Libre (Esc)";
        btn.disabled = true;

        this.addStandaloneClosureUI();

        // Non-blocking instruction banner
        const statusEl = document.getElementById('map-status-msg');
        if (statusEl) {
            statusEl.textContent = '🧵 Cableado libre: clic para agregar puntos — usa "Finalizar Cable Aquí" para terminar — Esc para cancelar.';
            statusEl.style.display = 'block';
            setTimeout(() => { statusEl.style.display = 'none'; }, 7000);
        }
    }

    async startConnectionFlow() {
        if (!this.currentNodeId) return;
        const node = this.inventoryManager.getNode(this.currentNodeId);
        if (!node) return;

        // Check for intersecting cables
        const intersectingCables = await this.inventoryManager.getConnectionsIntersectingNode(this.currentNodeId);

        if (intersectingCables.length === 0) {
            alert("⚠️ No hay cables pasando por este nodo. Primero debes usar 'Tender Cable' para trazar una ruta que pase por aquí.");
            return;
        }

        // Logical connection depends on node type
        if (node.type === 'RACK') {
            this.currentRackNodeId = node.id;
            this.switchView('rack');
            alert("Selecciona un puerto en el Rack para iniciar el parcheo a uno de los cables disponibles.");
        } else if (node.type === 'NAP' || node.type === 'MUFLA') {
            this.currentSplitterNodeId = node.id;
            this.showSplitterView();
            alert("Gestiona hilos de cables desde la vista de splitters o fusiones.");
        } else {
            this.currentSplitterNodeId = node.id;
            this.openFusionModal(false);
        }
    }

    addStandaloneClosureUI() {
        let btn = document.getElementById('btn-finish-standalone');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-finish-standalone';
            btn.className = 'action-btn';
            btn.style.position = 'fixed';
            btn.style.bottom = '20px';
            btn.style.left = '50%';
            btn.style.transform = 'translateX(-50%)';
            btn.style.zIndex = '1000';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            btn.innerHTML = '🏁 Finalizar Cable Aquí';
            btn.onclick = () => this.completeStandaloneConnection();
            document.body.appendChild(btn);
        }
        btn.classList.remove('hidden');
    }

    removeStandaloneClosureUI() {
        const btn = document.getElementById('btn-finish-standalone');
        if (btn) btn.classList.add('hidden');
    }

    completeStandaloneConnection() {
        if (!this.isConnecting || this.connectionWaypoints.length < 1) return;
        this.completeConnection();
    }

    addConnectionWaypoint(latlng) {
        if (!this.isConnecting) return;
        this.connectionWaypoints.push([latlng.lat, latlng.lng]);

        // If it's a standalone cabling and it's the first point, we just started
        if (this.connectionSourceId === null && this.connectionWaypoints.length === 1) {
            // No line to draw yet
        } else {
            if (window.planoManager && window.planoManager.isActive) {
                window.planoManager.updateTempPolyline(this.connectionWaypoints);
            } else {
                this.mapManager.updateTempPolyline(this.connectionWaypoints);
            }
        }
    }

    async completeConnection() {
        if (!this.isConnecting || this.connectionWaypoints.length < 2) {
            alert("Agrega al menos dos puntos para el tendido de cable.");
            return;
        }

        this.removeStandaloneClosureUI();

        // Detect potential end nodes from waypoints
        const firstPoint = this.connectionWaypoints[0];
        const lastPoint = this.connectionWaypoints[this.connectionWaypoints.length - 1];

        const nodes = this.inventoryManager.getNodes();
        const startNode = nodes.find(n => Math.abs(n.lat - firstPoint[0]) < 0.00001 && Math.abs(n.lng - firstPoint[1]) < 0.00001);
        const endNode = nodes.find(n => Math.abs(n.lat - lastPoint[0]) < 0.00001 && Math.abs(n.lng - lastPoint[1]) < 0.00001);

        this.connectionSourceId = startNode ? startNode.id : null;
        this.pendingConnectionTarget = endNode ? endNode.id : null;

        // Show connection modal for cable properties
        this.showConnectionModal();
    }

    handleRackConnection(sourceNode, targetNode) {
        // Check if nodes have ports/rack content
        const sourceHasPorts = sourceNode.rack && sourceNode.rack.length > 0;
        const targetHasPorts = targetNode.rack && targetNode.rack.length > 0;

        if (sourceHasPorts && targetHasPorts) {
            // Both sides have ports: Select Source Port -> Select Target Port -> Connect
            this.openRackPortSelect(sourceNode.id, true, () => {
                // Determine if we need to select target port too
                // (Wait a bit for UX transition)
                setTimeout(() => {
                    this.openRackPortSelect(targetNode.id, false, () => {
                        this.showConnectionModal();
                    });
                }, 200);
            });
        } else if (sourceHasPorts) {
            // Only Source has ports
            this.openRackPortSelect(sourceNode.id, true, () => {
                this.showConnectionModal();
            });
        } else if (targetHasPorts) {
            // Only Target has ports
            this.openRackPortSelect(targetNode.id, false, () => {
                this.showConnectionModal();
            });
        } else {
            // Fallback (shouldn't happen given logic in completeConnection)
            this.showConnectionModal();
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
            btn.textContent = port.label || port.number || port.id;

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
        if (this.isConnecting && this.connectionSourceId === null && this.connectionWaypoints.length < 1) {
            alert("Agrega al menos un punto para el tendido libre.");
            return;
        }
        if (this.isConnecting && this.connectionSourceId !== null && this.connectionWaypoints.length < 2) {
            alert("Agrega al menos un punto de quiebre o un nodo destino.");
            return;
        }

        const sourceNode = this.connectionSourceId ? this.inventoryManager.getNode(this.connectionSourceId) : null;
        // pendingConnectionTarget stores a node ID string — resolve it to the full node object
        const targetNode = this.pendingConnectionTarget ? this.inventoryManager.getNode(this.pendingConnectionTarget) : null;

        const identification = this.modalForms.connIdentification.value.trim();
        const cableType = this.modalForms.connCableType.value;
        let fibers = this.modalForms.connFibers.value;
        if (!fibers || fibers === "") {
            fibers = (cableType && cableType.toUpperCase().includes('UTP')) ? '4' : '1';
        }
        const sectionType = cableType === 'DROP' ? null : this.modalForms.connSectionType.value;

        // If not standalone, add target as final point
        if (targetNode && this.connectionWaypoints[this.connectionWaypoints.length - 1][0] !== targetNode.lat) {
            this.connectionWaypoints.push([targetNode.lat, targetNode.lng]);
        }

        try {
            const conn = await this.inventoryManager.addConnection(
                this.connectionSourceId,
                targetNode ? targetNode.id : null,
                [...this.connectionWaypoints],
                cableType,
                fibers,
                this.selectedSourcePort,
                this.selectedTargetPort,
                sectionType,
                identification,
                (window.planoManager && window.planoManager.isActive) ? window.planoManager.fullPlanoId : null
            );

            if (conn) {
                if (window.planoManager && window.planoManager.isActive) {
                    window.planoManager._renderPlanoElementsToMap();
                } else {
                    this.mapManager.addConnection(conn);
                    this.mapManager.refreshAllMarkers(this.inventoryManager);
                }

                this.closeModal('connection');
                this.resetConnectionState(); // Use the new reset method
                this.refreshNodeList();
                this.showConnectionDetails(conn.id);
            }
        } catch (e) {
            console.error("Error creating connection:", e);
            alert("Error al crear la conexión.");
        }
    }


    cancelConnectionFlow() {
        this.mapManager.clearTempPolyline();
        if (window.planoManager && window.planoManager.isActive) {
            window.planoManager.clearTempPolyline();
        }
        this.resetConnectionState();
        // Show non-blocking feedback
        const statusEl = document.getElementById('map-status-msg');
        if (statusEl) {
            statusEl.textContent = '❌ Conexión cancelada.';
            statusEl.style.display = 'block';
            setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
        }
    }

    resetConnectionState() {
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionWaypoints = [];
        this.pendingConnectionTarget = null;
        this.selectedSourcePort = null;
        this.selectedTargetPort = null;
        this.mapManager.clearTempPolyline();
        // Also clear temp polyline on plano map if active
        if (window.planoManager && window.planoManager.isActive) {
            window.planoManager.clearTempPolyline();
        }
        this.removeStandaloneClosureUI();

        const btnNode = this.details.btnConnect;
        if (btnNode) {
            btnNode.textContent = this._originalBtnText.connect || "🔗 CONECTAR";
            btnNode.disabled = false;
        }

        const btnTender = document.getElementById('btn-tender-cable');
        if (btnTender) {
            btnTender.textContent = this._originalBtnText.tenderCable || "🧵 Tender Cableado";
            btnTender.disabled = false;
        }
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
        // Clear previous dynamic fields
        this.modalForms.dynamicEquipFields.innerHTML = '';
        // Add listener for equipType change to render dynamic fields
        this.modalForms.equipType.removeEventListener('change', this.equipTypeChangeListener); // Remove old listener if exists
        this.equipTypeChangeListener = () => this.renderDynamicEquipFields(this.modalForms.equipType.value);
        this.modalForms.equipType.addEventListener('change', this.equipTypeChangeListener);
        // Render initial dynamic fields based on default/current type
        this.renderDynamicEquipFields(this.modalForms.equipType.value);
    }

    async finalizeAddEquipment() {
        const name = this.modalForms.equipName.value.trim();
        const type = this.modalForms.equipType.value;
        const portGroups = JSON.parse(this.modalForms.equipPortsData.value || "[]");
        const isProvider = this.modalForms.equipIsProvider.checked;

        if (!name) return alert("Nombre requerido");

        const equipment = {
            id: Date.now().toString(),
            name: name.toUpperCase(),
            type: type,
            portGroups: portGroups,
            isProvider: isProvider
        };

        try {
            await this.inventoryManager.addEquipmentToRack(this.currentRackNodeId, equipment);
            this.closeModal('equipment');
            // Refresh rack view if it's open
            const node = this.inventoryManager.getNode(this.currentRackNodeId);
            if (node) this.renderRackList(node);
        } catch (e) {
            console.error("Error adding equipment:", e);
            alert("Error al añadir equipo: " + e.message);
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
        this.portView.subtitle.textContent = `${equipment.type} - ${equipment.ports ? equipment.ports.length : 0} Puertos`;

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
            portEl.textContent = port.label || port.number || port.id;

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
        // Use loose equality or cast to handle potential numeric/string ID mismatches from Supabase
        const connections = this.inventoryManager.getConnections();
        const connection = connections.find(c => c.id == connectionId);
        if (!connection) {
            console.error("Connection not found:", connectionId);
            return;
        }

        this.currentConnectionId = connectionId;

        const fromNode = connection.from ? this.inventoryManager.getNode(connection.from) : null;
        const toNode = connection.to ? this.inventoryManager.getNode(connection.to) : { name: 'Final Abierto (Standalone)' };

        this.connectionDetails.fromName.textContent = fromNode ? fromNode.name : '(Punto Libre)';
        this.connectionDetails.toName.textContent = toNode ? toNode.name : '(Punto Libre)';

        // Safety check for ID display elements
        if (this.connectionDetails.identificationRow && this.connectionDetails.identification) {
            if (connection.identification) {
                this.connectionDetails.identificationRow.classList.remove('hidden');
                this.connectionDetails.identification.textContent = connection.identification;
            } else {
                this.connectionDetails.identificationRow.classList.add('hidden');
            }
        }
        this.connectionDetails.cableType.textContent = connection.cableType || '--';
        this.connectionDetails.fibers.textContent = connection.fibers || '--';

        const distance = this.mapManager.calculateDistance(connection.path);
        this.connectionDetails.distance.textContent = distance.toFixed(2);

        // Reserve Calculation
        let totalReserve = 0;
        if (fromNode && fromNode.reserve) totalReserve += parseFloat(fromNode.reserve || 0);
        if (toNode && toNode.id && toNode.reserve) totalReserve += parseFloat(toNode.reserve || 0);

        // Intermediate Node Reserves (nodes that this cable "touches")
        const intermediateReserves = this.inventoryManager.getIntermediateReserves(connection);
        totalReserve += intermediateReserves;

        const totalLength = distance + totalReserve;

        this.connectionDetails.reserve.textContent = totalReserve.toFixed(2);
        this.connectionDetails.total.textContent = totalLength.toFixed(2);

        if (connection.cableType === 'DROP') {
            this.connectionDetails.sectionTypeRow.classList.add('hidden');
        } else {
            this.connectionDetails.sectionTypeRow.classList.remove('hidden');
            this.connectionDetails.sectionType.textContent = connection.sectionType || 'No definido';
        }

        // Map Ports visibility
        const type = (connection.cableType || '').toUpperCase();
        const isFiber = type.includes('ADSS') || type.includes('ASU') || type.includes('DROP') || type.includes('FIBRA') || type.includes('MINI-ADSS');

        // Safer check for rack ports
        const sourceHasPorts = fromNode && fromNode.rack && Array.isArray(fromNode.rack) && fromNode.rack.length > 0;
        const targetHasPorts = toNode && toNode.rack && Array.isArray(toNode.rack) && toNode.rack.length > 0;

        if (isFiber && (sourceHasPorts || targetHasPorts)) {
            this.connectionDetails.btnMapPorts.classList.remove('hidden');
        } else {
            this.connectionDetails.btnMapPorts.classList.add('hidden');
        }

        // Highlight in Map
        this.mapManager.resetNetworkStyles(this.inventoryManager);
        this.mapManager.highlightConnection(connectionId);

        this.switchView('connection');
    }

    // --- Fiber to Port Mapping Logic ---
    openFiberMappingModal() {
        const connection = this.inventoryManager.getConnections().find(c => c.id === this.currentConnectionId);
        if (!connection) return;

        const fromNode = this.inventoryManager.getNode(connection.from);
        const toNode = this.inventoryManager.getNode(connection.to);

        this.mappingModal.sourceNode.innerHTML = `<strong>${fromNode.name}</strong><br><small>${fromNode.type}</small>`;
        this.mappingModal.targetNode.innerHTML = `<strong>${toNode.name}</strong><br><small>${toNode.type}</small>`;

        this.renderFiberMappingList(connection);
        this.mappingModal.modal.classList.remove('hidden');
    }

    renderFiberMappingList(connection) {
        const container = this.mappingModal.fiberList;
        container.innerHTML = '';

        const fromNode = this.inventoryManager.getNode(connection.from);
        const toNode = this.inventoryManager.getNode(connection.to);
        const isFiberCable = connection.cableType !== 'UTP';

        connection.fiberDetails.forEach(fiber => {
            const item = document.createElement('div');
            item.style.padding = '12px';
            item.style.borderBottom = '1px solid #eee';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.gap = '10px';

            const fromTerm = fiber.fromTermination || {};
            const toTerm = fiber.toTermination || {};

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:14px; height:14px; background:${fiber.colorHex}; border:1px solid #ccc; border-radius:3px;"></div>
                    <div style="flex:1"><strong>Hilo ${fiber.number}</strong> (${fiber.color})</div>
                </div>

                <div style="display:flex; gap:10px;">
                    <div style="flex:1">
                        <small style="color:#666; font-size:10px; display:block; margin-bottom:2px;">TERMINACIÓN EN ORIGEN</small>
                        <select class="form-select fiber-mapping-select" data-fiber="${fiber.number}" data-side="from" style="font-size:11px; padding:4px;">
                            <option value="">(Sin Terminar)</option>
                            ${this.generatePortOptionsHtml(fromNode, fromTerm.portId, isFiberCable)}
                        </select>
                    </div>

                    <div style="flex:1">
                        <small style="color:#666; font-size:10px; display:block; margin-bottom:2px;">TERMINACIÓN EN DESTINO</small>
                        <select class="form-select fiber-mapping-select" data-fiber="${fiber.number}" data-side="to" style="font-size:11px; padding:4px;">
                            <option value="">(Sin Terminar)</option>
                            ${this.generatePortOptionsHtml(toNode, toTerm.portId, isFiberCable)}
                        </select>
                    </div>
                </div>
            `;
            container.appendChild(item);
        });
    }

    generatePortOptionsHtml(node, selectedPortId, isFiberCable) {
        if (!node || !node.rack || node.rack.length === 0) return '';
        const fiberPortTypes = ['SFP', 'SFP+', 'SC/APC', 'LC'];
        let html = '';
        node.rack.forEach(equip => {
            let equipHtml = '';
            equip.ports.forEach(port => {
                const isFiberPort = fiberPortTypes.includes(port.type);
                // Filter ports: only show compatible ones
                if (isFiberCable === isFiberPort) {
                    const isSelected = selectedPortId === port.id;
                    equipHtml += `<option value="${equip.id}|${port.id}|${port.number}" ${isSelected ? 'selected' : ''}>P${port.number} - ${port.type}</option>`;
                }
            });

            if (equipHtml) {
                html += `<optgroup label="${equip.name} (${equip.type})">` + equipHtml + `</optgroup>`;
            }
        });
        return html;
    }

    async saveFiberMapping() {
        const connection = this.inventoryManager.getConnections().find(c => c.id === this.currentConnectionId);
        if (!connection) return;

        const selects = this.mappingModal.fiberList.querySelectorAll('.fiber-mapping-select');
        selects.forEach(select => {
            const fiberNum = parseInt(select.dataset.fiber);
            const side = select.dataset.side;
            const fiber = connection.fiberDetails.find(f => f.number === fiberNum);

            if (select.value) {
                const [equipId, portId, portNumber] = select.value.split('|');
                const termData = {
                    nodeId: side === 'from' ? connection.from : connection.to,
                    equipId: equipId,
                    portId: portId,
                    portNumber: portNumber
                };
                if (side === 'from') fiber.fromTermination = termData; else fiber.toTermination = termData;
            } else {
                if (side === 'from') fiber.fromTermination = null; else fiber.toTermination = null;
            }
        });

        try {
            await this.inventoryManager.updateConnection(connection);
            this.mappingModal.modal.classList.add('hidden');
            alert("✅ Mapeo de hilos guardado correctamente.");
        } catch (e) {
            alert("Error al guardar: " + e.message);
        }
    }

    editConnection() {
        if (!this.currentConnectionId) return;

        const connection = this.inventoryManager.getConnections().find(c => c.id === this.currentConnectionId);
        if (!connection) return;

        // Show modal with current values
        this.modalForms.connCableType.value = connection.cableType || 'ADSS FIBRA';
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
                this.refreshNodeList();
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

        // Refresh the marker to show the alert icon immediately
        this.mapManager.addMarker(node);

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

        // Refresh the marker to update the alert icon immediately
        this.mapManager.addMarker(node);

        // Refresh the view
        this.showNodeDetails(nodeId);

        // If reports panel is open, refresh it too
        if (this.views.reports && !this.views.reports.classList.contains('hidden')) {
            this.renderAllReports();
        }

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
    handleInterFloorLink(node) {
        const site = window.inventoryManager.getNode(window.planoManager.parentNodeId);
        if (!site || !site.customFields.layers) return;

        const otherLayers = site.customFields.layers.filter(l => l.id !== window.planoManager.currentLayerId);
        if (otherLayers.length === 0) {
            alert('No hay otros pisos registrados en este sitio para vincular. Agrega una nueva capa primero.');
            return;
        }

        let msg = "Selecciona el piso destino para vincular este nodo:\n";
        otherLayers.forEach((l, idx) => msg += `${idx + 1}. ${l.name}\n`);
        const choice = prompt(msg);
        if (choice && otherLayers[parseInt(choice) - 1]) {
            const target = otherLayers[parseInt(choice) - 1];
            node.customFields = node.customFields || {};
            node.customFields.link_to_plano_id = `${site.id}_${target.id}`;
            window.inventoryManager.updateNode(node);
            alert(`Vínculo creado exitosamente hacia ${target.name}`);
            this.showNodeDetails(node.id);
        }
    }

    showNodeDetails(nodeId) {
        const node = this.inventoryManager.getNode(nodeId);
        if (!node) return;

        this.currentNodeId = nodeId;
        this.details.name.textContent = node.name;
        this.details.type.textContent = node.type;
        this.details.reserve.textContent = parseFloat(node.reserve || 0).toFixed(2);
        this.details.coords.textContent = `${node.lat.toFixed(5)}, ${node.lng.toFixed(5)}`;

        // Handle Elevation Display
        const elevRow = document.getElementById('detail-elevation-row');
        const elevSpan = document.getElementById('detail-height');
        if (elevRow && elevSpan) {
            if (node.customFields?.height) {
                elevRow.classList.remove('hidden');
                elevSpan.textContent = parseFloat(node.customFields.height).toFixed(2);
            } else {
                elevRow.classList.add('hidden');
            }
        }

        // Handle Inter-floor linking button
        const linkAction = document.getElementById('vertical-link-action');
        if (linkAction) {
            if (window.planoManager && window.planoManager.isActive) {
                linkAction.classList.remove('hidden');
                document.getElementById('btn-link-floor').onclick = () => this.handleInterFloorLink(node);

                // If it's already linked, change text
                if (node.customFields?.link_to_plano_id) {
                    const targetParts = node.customFields.link_to_plano_id.split('_');
                    document.getElementById('btn-link-floor').innerHTML = `🚀 Saltar a Capa Destino`;
                    document.getElementById('btn-link-floor').onclick = () => {
                        const site = window.inventoryManager.getNode(targetParts[0]);
                        const layer = (site?.customFields?.layers || []).find(l => l.id === targetParts[1]);
                        if (layer) window.planoManager.enterPlanoMode(layer.dataUrl, site.id, layer.id);
                    };
                } else {
                    document.getElementById('btn-link-floor').innerHTML = `🏢 Vincular con otro Piso`;
                }
            } else {
                linkAction.classList.add('hidden');
            }
        }

        this.details.type.style.backgroundColor = this.mapManager.getColorForType(node.type);

        // Show extra info for ONUs or Custom Types
        if (node.type === 'ONU' && node.clientData) {
            this.details.extraInfo.innerHTML = `
                <p><strong>Cliente:</strong> ${node.clientData.address}</p>
                <p><strong>Plan:</strong> ${node.clientData.plan}</p>
            `;
        } else if (node.customFields) {
            let fieldsHtml = '';
            const internalFields = ['is_plano', 'layers', 'cota', 'plano_id', 'link_to_plano_id', 'full_plano_id', 'plano_elements'];
            for (const [key, val] of Object.entries(node.customFields)) {
                if (internalFields.includes(key)) continue;

                let displayVal = val;
                if (Array.isArray(val)) {
                    displayVal = val.map(g => `${g.qty}x ${g.type}`).join(', ');
                }

                // Antenna A/B Highlight
                let style = '';
                if (displayVal === 'Antena A') style = 'color:#e74c3c; font-weight:bold; background:#fdecea; padding:2px 5px; border-radius:3px;';
                if (displayVal === 'Antena B') style = 'color:#2980b9; font-weight:bold; background:#eaf2f8; padding:2px 5px; border-radius:3px;';

                fieldsHtml += `<p><strong>${key}:</strong> <span style="${style}">${displayVal || '---'}</span></p>`;
            }
            this.details.extraInfo.innerHTML = fieldsHtml;
        } else {
            this.details.extraInfo.innerHTML = '';
        }

        // Show damage reports
        let damageReportsHtml = '';
        if (node.damageReports && node.damageReports.length > 0) {
            // Sort all reports by timestamp (newest first)
            const sortedReports = [...node.damageReports].sort((a, b) =>
                new Date(b.reportedAt || b.timestamp) - new Date(a.reportedAt || a.timestamp)
            );

            // Separate pending and resolved reports
            const pendingReports = sortedReports.filter(r => !r.resolved);
            const resolvedReports = sortedReports.filter(r => r.resolved);

            // Combine: show pending first, then resolved (max 5 total)
            const reportsToShow = [
                ...pendingReports.slice(0, 5),
                ...resolvedReports.slice(0, Math.max(0, 5 - pendingReports.length))
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

        // Actions & Buttons Visibility
        const nodeTypeCfg = this.customNodeTypes.find(t => t.name === node.type);

        // Rack Button: Only for RACK type
        if (node.type === 'RACK') {
            this.details.btnViewRack.classList.remove('hidden');
        } else {
            this.details.btnViewRack.classList.add('hidden');
        }

        // Manage Ports Button: For non-rack nodes that have ports or rack fields
        const hasPortsField = nodeTypeCfg && nodeTypeCfg.fields.some(f => f.type === 'ports' || f.type === 'rack');
        const hasInternalPorts = node.rack && node.rack.length > 0;
        if (node.type !== 'RACK' && (hasPortsField || hasInternalPorts)) {
            this.details.btnManagePorts.classList.remove('hidden');
        } else {
            this.details.btnManagePorts.classList.add('hidden');
        }

        // Splitter Button: Only for MUFLA, NAP or if it has an explicit "splitter" field


        // Splitter Button: Only for MUFLA, NAP or if it has an explicit 'splitter' field
        const hasSplitterField = nodeTypeCfg && nodeTypeCfg.fields.some(f => f.type === 'splitter');
        if (node.type === 'MUFLA' || node.type === 'NAP' || hasSplitterField) {
            this.details.btnViewSplitters.classList.remove('hidden');
        } else {
            this.details.btnViewSplitters.classList.add('hidden');
        }

        // Connect Button: Only if node has equipment/ports OR splitters OR cables passing through
        const intersectingCables = this.inventoryManager.getConnections().filter(c => {
            if (c.from === node.id || c.to === node.id) return true;
            return c.path && c.path.some(p => Math.abs(p[0] - node.lat) < 0.000001 && Math.abs(p[1] - node.lng) < 0.000001);
        });

        const hasEquipment = node.rack && node.rack.length > 0;
        const hasSplitters = node.splitters && node.splitters.length > 0;
        const hasCables = intersectingCables.length > 0;

        const canConnect = hasEquipment || hasSplitters || hasCables;
        this.details.btnConnect.disabled = !canConnect;

        if (!canConnect) {
            this.details.btnConnect.title = "No hay equipos, splitters ni cables disponibles para conectar en este nodo.";
            this.details.btnConnect.style.opacity = "0.5";
            this.details.btnConnect.style.cursor = "not-allowed";
        } else {
            this.details.btnConnect.title = hasCables ? "Realizar parcheos o fusiones lógicoas" : "Configura cables primero";
            this.details.btnConnect.style.opacity = "1";
            this.details.btnConnect.style.cursor = "pointer";
        }

        // Hide previous reports & refresh styles
        this.details.reportResults.classList.add('hidden');
        this.mapManager.resetNetworkStyles();

        // Highlight affected network if there are unresolved reports
        const hasUnresolvedReports = node.damageReports && node.damageReports.some(r => !r.resolved);
        if (hasUnresolvedReports) {
            const impact = this.inventoryManager.getDownstreamImpact(nodeId);
            this.mapManager.highlightAffectedNetwork(
                impact.nodes.map(n => n.id),
                impact.connectionIds
            );
        }

        this.switchView('details');
    }

    async deleteCurrentNode() {
        if (!this.currentNodeId) return;

        if (!confirm('⚠️ ¿Estás COMPLETAMENTE seguro de eliminar este NODO? Esta acción no se puede deshacer.')) {
            return;
        }

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

    async loadCustomNodeTypes() {
        try {
            const { data, error } = await supabaseClient.from('node_types').select('*').order('name');
            if (error) throw error;
            this.customNodeTypes = data;

            // Re-populate type select in add form
            if (this.form && this.form.type) {
                const current = this.form.type.value;
                this.form.type.innerHTML = '<option value="MUFLA">Mufla</option><option value="NAP">NAP</option><option value="ONU">ONU (Cliente)</option><option value="RACK">Rack / Nodo Core</option>';
                this.customNodeTypes.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.name;
                    opt.textContent = t.name;
                    this.form.type.appendChild(opt);
                });
                this.form.type.value = current;
            }
        } catch (e) {
            console.error("Error loading custom node types:", e);
        }
    }

    async loadMasterLists() {
        try {
            const { data, error } = await supabaseClient.from('master_lists').select('*, items:master_list_items(*)');
            if (error) throw error;
            this.masterLists = data;
            this.populateMasterListSelects();
        } catch (e) {
            console.error("Error loading master lists:", e);
        }
    }

    populateMasterListSelects() {
        if (!this.masterLists) return;

        // Populate Rack Equipment Types
        const rackList = this.masterLists.find(l => l.name === 'Tipos de Equipo Rack');
        if (rackList && this.modalForms.equipType) {
            const select = this.modalForms.equipType;
            const current = select.value;
            select.innerHTML = '';
            rackList.items.sort((a, b) => a.sort_order - b.sort_order).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.value;
                opt.textContent = item.label;
                select.appendChild(opt);
            });
            if (current) select.value = current;
        }

        // Populate Service Plans (if needed in ONU flow)
        const plansList = this.masterLists.find(l => l.name === 'Planes de Servicio');
        if (plansList && this.form.clientPlan) {
            const select = this.form.clientPlan;
            const current = select.value;
            select.innerHTML = '<option value="">Seleccione plan...</option>';
            plansList.items.sort((a, b) => a.sort_order - b.sort_order).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.value;
                opt.textContent = item.label;
                select.appendChild(opt);
            });
            if (current) select.value = current;
        }
    }

    async loadCableTypes() {
        try {
            const { data, error } = await supabaseClient.from('cable_types').select('*').order('name');
            if (error) throw error;
            this.cableTypes = data || [];
            this.updateCableTypeOptions();
        } catch (e) {
            console.error("Error loading cable types:", e);
        }
    }

    updateCableTypeOptions() {
        const select = this.modalForms.connCableType;
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = '';

        this.cableTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.name;
            opt.textContent = type.name;
            opt.dataset.threads = type.threads_count;
            opt.dataset.media = type.media_type;
            select.appendChild(opt);
        });

        if (currentVal && this.cableTypes.find(t => t.name === currentVal)) {
            select.value = currentVal;
        }
    }

    renderDynamicEquipFields(typeName) {
        const container = this.modalForms.dynamicEquipFields;
        if (!container) return;
        container.innerHTML = '';

        const customType = this.customNodeTypes.find(t => t.name === typeName);
        if (!customType || !customType.fields) {
            // If no custom config, show default port config UI
            container.innerHTML = `
                <div class="form-group">
                    <label class="form-label">Configuración de Puertos (Genérico)</label>
                    <div style="background:#f1f1f1; padding:8px; border-radius:4px; margin-top:5px;">
                        <div id="eq-ports-list-generic" style="margin-bottom:5px; font-size:11px;"></div>
                        <div style="display:flex; gap:5px;">
                            <select id="pt-type-generic" class="form-select" style="font-size:11px; padding:2px;">
                                <option value="Gigabit">Gigabit</option>
                                <option value="SFP">SFP</option>
                                <option value="SFP+">SFP+</option>
                                <option value="SC/APC">SC/APC</option>
                            </select>
                            <input type="number" id="pt-qty-generic" class="form-input" style="width:50px; font-size:11px; padding:2px;" placeholder="Cant">
                            <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="window.uiManager.addPortGroupToDynamicEquipField('generic')">+</button>
                        </div>
                        <input type="hidden" id="dynamic-eq-field-generic" value="[]">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="dynamic-eq-field-provider" style="margin-right: 8px;">
                        Es Proveedor de Internet
                    </label>
                </div>`;
            return;
        }

        customType.fields.forEach(f => {
            const safeName = f.name.replace(/[^a-z0-9]/gi, '_');
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.borderLeft = `3px solid ${customType.color || '#3498db'}`;
            group.style.paddingLeft = '10px';
            group.style.marginBottom = '15px';

            let inputHtml = '';
            if (f.type === 'ports') {
                inputHtml = `
                    <div id="ports-config-eq-${safeName}" style="background:#f1f1f1; padding:8px; border-radius:4px; margin-top:5px;">
                        <div id="ports-list-eq-${safeName}" style="margin-bottom:5px; font-size:11px;"></div>
                        <div style="display:flex; gap:5px;">
                            <select id="pt-type-eq-${safeName}" class="form-select" style="font-size:11px; padding:2px;">
                                <option value="Gigabit">Gigabit</option>
                                <option value="SFP">SFP</option>
                                <option value="SFP+">SFP+</option>
                                <option value="SC/APC">SC/APC</option>
                            </select>
                            <input type="number" id="pt-qty-eq-${safeName}" class="form-input" style="width:50px; font-size:11px; padding:2px;" placeholder="Cant">
                            <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="window.uiManager.addPortGroupToDynamicEquipField('${safeName}')">+</button>
                        </div>
                        <input type="hidden" id="dynamic-eq-field-${safeName}" value="[]">
                    </div>`;
            } else if (f.type === 'select' && f.options) {
                inputHtml = `<select class="form-select" id="dynamic-eq-field-${safeName}">
                    ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
                </select>`;
            } else if (f.type === 'checkbox') {
                inputHtml = `<input type="checkbox" id="dynamic-eq-field-${safeName}">`;
            } else {
                inputHtml = `<input type="text" class="form-input" id="dynamic-eq-field-${safeName}" placeholder="${f.name}">`;
            }

            group.innerHTML = `<label class="form-label">${f.name}</label>${inputHtml}`;
            container.appendChild(group);
        });

        // Always add provider checkbox if not present
        if (!customType.fields.some(f => f.name === "Es Proveedor de Internet")) {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.innerHTML = `
                <label class="form-label" style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="dynamic-eq-field-provider" style="margin-right: 8px;">
                    Es Proveedor de Internet
                </label>`;
            container.appendChild(group);
        }
    }

    addPortGroupToDynamicEquipField(safeName) {
        let typeId, qtyId, listId, dataId;
        if (safeName === 'generic') {
            typeId = 'pt-type-generic';
            qtyId = 'pt-qty-generic';
            listId = 'eq-ports-list-generic';
            dataId = 'dynamic-eq-field-generic';
        } else {
            typeId = `pt-type-eq-${safeName}`;
            qtyId = `pt-qty-eq-${safeName}`;
            listId = `ports-list-eq-${safeName}`;
            dataId = `dynamic-eq-field-${safeName}`;
        }

        const type = document.getElementById(typeId).value;
        const qtyStr = document.getElementById(qtyId).value;
        const qty = parseInt(qtyStr);
        const list = document.getElementById(listId);
        const dataInput = document.getElementById(dataId);

        if (!qty || qty <= 0) return;

        const currentData = JSON.parse(dataInput.value || "[]");
        currentData.push({ type, qty: qty });
        dataInput.value = JSON.stringify(currentData);

        // Update list display
        const tag = document.createElement('span');
        tag.className = 'badge';
        tag.style.margin = '2px';
        tag.style.display = 'inline-block';
        tag.style.padding = '2px 6px';
        tag.style.background = '#e0e0e0';
        tag.style.borderRadius = '3px';
        tag.style.fontSize = '10px';
        tag.textContent = `${qty}x ${type}`;
        list.appendChild(tag);

        document.getElementById(qtyId).value = '';
    }

    renderDynamicFields(typeName) {
        const container = this.form.dynamicFields;
        if (!container) return;
        container.innerHTML = '';
        const customType = this.customNodeTypes.find(t => t.name === typeName);
        if (!customType || !customType.fields) return;

        customType.fields.forEach(f => {
            const safeName = f.name.replace(/[^a-z0-9]/gi, '_');
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.borderLeft = `3px solid ${customType.color || '#3498db'}`;
            group.style.paddingLeft = '10px';
            group.style.marginBottom = '15px';

            let inputHtml = '';
            if (f.type === 'textarea') {
                inputHtml = `<textarea class="form-input" id="dynamic-field-${safeName}" placeholder="${f.name}"></textarea>`;
            } else if (f.type === 'number') {
                inputHtml = `<input type="number" class="form-input" id="dynamic-field-${safeName}" placeholder="0">`;
            } else if (f.type === 'select' && f.options) {
                inputHtml = `<select class="form-select" id="dynamic-field-${safeName}">
                    <option value="">Seleccione...</option>
                    ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
                </select>`;
            } else if (f.type === 'ports') {
                inputHtml = `
                    <div id="ports-config-${safeName}" style="background:#f1f1f1; padding:8px; border-radius:4px; margin-top:5px;">
                        <div id="ports-list-${safeName}" style="margin-bottom:5px; font-size:11px;"></div>
                        <div style="display:flex; gap:5px;">
                            <select id="pt-type-${safeName}" class="form-select" style="font-size:11px; padding:2px;">
                                <option value="Gigabit">Gigabit</option>
                                <option value="SFP">SFP</option>
                                <option value="SFP+">SFP+</option>
                                <option value="POE">POE</option>
                                <option value="RJ45">RJ45</option>
                                <option value="SC/APC">SC/APC</option>
                                <option value="LC">LC</option>
                            </select>
                            <input type="number" id="pt-qty-${safeName}" class="form-input" style="width:50px; font-size:11px; padding:2px;" placeholder="Cant">
                            <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="window.uiManager.addPortGroupToDynamicField('${safeName}')">+</button>
                        </div>
                        <input type="hidden" id="dynamic-field-${safeName}" value="[]">
                    </div>`;
            } else if (f.type === 'splitter') {
                inputHtml = `<div style="font-size:11px; color:#666;">Se habilitará gestión de Splitters al crear.</div><input type="text" class="form-input" id="dynamic-field-${safeName}" placeholder="Nota splitter...">`;
            } else if (f.type === 'rack') {
                inputHtml = `<div style="font-size:11px; color:#666;">Se habilitará gestión de Rack al crear.</div><input type="text" class="form-input" id="dynamic-field-${safeName}" placeholder="Nota rack...">`;
            } else {
                inputHtml = `<input type="text" class="form-input" id="dynamic-field-${safeName}" placeholder="${f.name}">`;
            }

            group.innerHTML = `<label class="form-label">${f.name}</label>${inputHtml}`;
            container.appendChild(group);
        });
    }

    addPortGroupToDynamicField(fieldKey) {
        const type = document.getElementById(`pt-type-${fieldKey}`).value;
        const qty = parseInt(document.getElementById(`pt-qty-${fieldKey}`).value);
        if (!qty || qty <= 0) return;

        const hiddenInput = document.getElementById(`dynamic-field-${fieldKey}`);
        if (!hiddenInput) return;

        let groups = JSON.parse(hiddenInput.value || "[]");
        groups.push({ type, qty });
        hiddenInput.value = JSON.stringify(groups);

        // Update UI list
        const list = document.getElementById(`ports-list-${fieldKey}`);
        if (list) {
            const tag = document.createElement('span');
            tag.style = 'display:inline-block; background:#fff; border:1px solid #ccc; padding:2px 5px; margin:2px; border-radius:3px; font-size:10px;';
            tag.textContent = `${qty}x ${type}`;
            list.appendChild(tag);
        }

        // Reset qty
        document.getElementById(`pt-qty-${fieldKey}`).value = '';
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

        // Logic moved to UIManager.init() to allow navigation before project selection
        // this.setupNavigationButtons();
    }

    refreshNodeList() {
        // NODES SECTION
        const nodeContainer = document.getElementById('node-list-container');
        if (!nodeContainer) return;
        let nodes = this.inventoryManager.getNodes();

        // Context filtering: in plano mode show only plano nodes
        const inPlano = window.planoManager && window.planoManager.isActive;
        if (inPlano) {
            nodes = nodes.filter(n => n.customFields?.plano_id === window.planoManager.fullPlanoId);
        } else {
            // In map mode, exclude plano-site marker nodes from the sidebar list
            nodes = nodes.filter(n => !n.customFields?.is_plano);
        }

        if (nodes.length === 0) {
            nodeContainer.innerHTML = '<p class="empty-state">' + (inPlano ? 'No hay nodos en este plano.' : 'No hay nodos registrados.') + '</p>';
        } else {
            nodeContainer.innerHTML = '';
            nodes.forEach(node => {
                const item = document.createElement('div');
                item.className = 'nav-btn';
                item.style.fontSize = '14px';
                item.innerHTML = `
                    <span style="color: ${this.mapManager.getColorForType(node.type)}">●</span>
                        ${node.name} <small style="margin-left:auto; opacity:0.6">${node.type}</small>
                `;
                item.addEventListener('click', () => {
                    this.navigateToNode(node.id, true);
                });
                nodeContainer.appendChild(item);
            });
        }

        // CABLES SECTION
        const cableContainer = document.getElementById('cable-list-container');
        let connections = this.inventoryManager.getConnections();

        // Context filtering
        if (window.planoManager && window.planoManager.isActive) {
            connections = connections.filter(c => c.fiberDetails && c.fiberDetails.some(f => f.plano_id === window.planoManager.fullPlanoId));
        }

        if (connections.length === 0) {
            cableContainer.innerHTML = '<p class="empty-state">No hay cables registrados.</p>';
        } else {
            cableContainer.innerHTML = '';
            connections.forEach(conn => {
                const fromNode = this.inventoryManager.getNode(conn.from);
                const toNode = this.inventoryManager.getNode(conn.to);
                const title = conn.identification || `${fromNode?.name || '---'} ↔ ${toNode?.name || '---'}`;

                const item = document.createElement('div');
                item.className = 'nav-btn';
                item.style.fontSize = '14px';
                item.innerHTML = `
                    <span style="color: #333">🧵</span>
                        ${title} <small style="margin-left:auto; opacity:0.6">${conn.cableType}</small>
                `;
                item.addEventListener('click', () => {
                    this.navigateToConnection(conn.id, true);
                });
                cableContainer.appendChild(item);
            });
        }
    }


    setupNavigationButtons() {
        const btnMap = document.getElementById('btn-map');
        const btnInventory = document.getElementById('btn-inventory');
        const btnReports = document.getElementById('btn-reports');

        if (btnMap) {
            btnMap.addEventListener('click', () => {
                this.showMapView();
            });
        }

        if (btnInventory) {
            btnInventory.addEventListener('click', () => {
                this.showMainInventoryView();
            });
        }

        if (btnReports) {
            btnReports.addEventListener('click', () => {
                this.showMainReportsView();
            });
        }

        // Inventory view listeners
        if (this.inventoryUI.btnGrid) {
            this.inventoryUI.btnGrid.addEventListener('click', () => {
                this.inventoryDisplayMode = 'grid';
                this.inventoryUI.btnGrid.classList.add('active');
                this.inventoryUI.btnList.classList.remove('active');
                this.inventoryUI.container.className = 'grid-view';
                this.renderInventory();
            });
        }

        if (this.inventoryUI.btnList) {
            this.inventoryUI.btnList.addEventListener('click', () => {
                this.inventoryDisplayMode = 'list';
                this.inventoryUI.btnList.classList.add('active');
                this.inventoryUI.btnGrid.classList.remove('active');
                this.inventoryUI.container.className = 'list-view';
                this.renderInventory();
            });
        }

        if (this.inventoryUI.search) {
            this.inventoryUI.search.addEventListener('input', (e) => {
                this.inventorySearchQuery = e.target.value.toLowerCase();
                this.renderInventory();
            });
        }

        if (this.inventoryUI.btnClose) {
            this.inventoryUI.btnClose.addEventListener('click', () => {
                this.hideMainInventoryView();
            });
        }

        // Reports filter buttons
        const filterAll = document.getElementById('filter-all');
        const filterPending = document.getElementById('filter-pending');
        const filterResolved = document.getElementById('filter-resolved');

        if (filterAll) {
            filterAll.addEventListener('click', () => {
                this.currentReportsFilter = 'all';
                this.updateFilterButtons('filter');
                this.renderAllReports();
            });
        }

        if (filterPending) {
            filterPending.addEventListener('click', () => {
                this.currentReportsFilter = 'pending';
                this.updateFilterButtons('filter');
                this.renderAllReports();
            });
        }

        if (filterResolved) {
            filterResolved.addEventListener('click', () => {
                this.currentReportsFilter = 'resolved';
                this.updateFilterButtons('filter');
                this.renderAllReports();
            });
        }

        // Full reports view button
        const btnViewFullReports = document.getElementById('btn-view-full-reports');
        if (btnViewFullReports) {
            btnViewFullReports.addEventListener('click', () => {
                this.showMainReportsView();
            });
        }

        // Main reports filter buttons
        const mainFilterAll = document.getElementById('main-filter-all');
        const mainFilterPending = document.getElementById('main-filter-pending');
        const mainFilterResolved = document.getElementById('main-filter-resolved');

        if (mainFilterAll) {
            mainFilterAll.addEventListener('click', () => {
                this.currentMainReportsFilter = 'all';
                this.updateFilterButtons('main-filter');
                this.renderMainReports();
            });
        }

        if (mainFilterPending) {
            mainFilterPending.addEventListener('click', () => {
                this.currentMainReportsFilter = 'pending';
                this.updateFilterButtons('main-filter');
                this.renderMainReports();
            });
        }

        if (mainFilterResolved) {
            mainFilterResolved.addEventListener('click', () => {
                this.currentMainReportsFilter = 'resolved';
                this.updateFilterButtons('main-filter');
                this.renderMainReports();
            });
        }

        // Close main reports view
        const btnCloseMainReports = document.getElementById('btn-close-full-reports-main');
        if (btnCloseMainReports) {
            btnCloseMainReports.addEventListener('click', () => {
                this.hideMainReportsView();
            });
        }
    }

    updateFilterButtons(prefix) {
        const filter = prefix === 'filter' ? this.currentReportsFilter : this.currentMainReportsFilter;

        ['all', 'pending', 'resolved'].forEach(type => {
            const btn = document.getElementById(`${prefix}-${type}`);
            if (btn) {
                if (type === filter) {
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('action-btn');
                } else {
                    btn.classList.remove('action-btn');
                    btn.classList.add('btn-secondary');
                }
            }
        });
    }

    showAllReports() {
        this.switchView('reports');
        this.currentReportsFilter = 'all';
        this.updateFilterButtons('filter');
        this.renderAllReports();
    }

    renderAllReports() {
        const container = document.getElementById('all-reports-list');
        const viewMoreContainer = document.getElementById('view-more-container');
        const nodes = this.inventoryManager.getNodes();

        // Collect all reports from all nodes
        let allReports = [];
        nodes.forEach(node => {
            if (node.damageReports && node.damageReports.length > 0) {
                node.damageReports.forEach(report => {
                    allReports.push({
                        ...report,
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type
                    });
                });
            }
        });

        // Apply filter
        if (this.currentReportsFilter === 'pending') {
            allReports = allReports.filter(r => !r.resolved);
        } else if (this.currentReportsFilter === 'resolved') {
            allReports = allReports.filter(r => r.resolved);
        }

        // Sort by date (newest first)
        allReports.sort((a, b) => new Date(b.reportedAt || b.timestamp) - new Date(a.reportedAt || a.timestamp));

        if (allReports.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay reportes registrados.</p>';
            if (viewMoreContainer) viewMoreContainer.classList.add('hidden');
            return;
        }

        // Show only first 5 reports
        const reportsToShow = allReports.slice(0, 5);
        const hasMore = allReports.length > 5;

        let html = '';
        reportsToShow.forEach(report => {
            const date = new Date(report.reportedAt || report.timestamp);
            const dateStr = date.toLocaleString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = report.resolved ? 'resolved' : 'pending';
            const statusText = report.resolved ? 'Resuelto' : 'Pendiente';

            html += `
                <div class="report-item ${statusClass}" onclick="window.uiManager.navigateToNode('${report.nodeId}', true)">
                    <div class="report-header">
                        <span class="report-node-name">${report.nodeName} (${report.nodeType})</span>
                        <span class="report-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="report-description">${report.description}</div>
                    <div class="report-date">📅 ${dateStr}</div>
                    ${report.resolved ? `<div class="report-date" style="color: #28a745;">✓ Resuelto: ${new Date(report.resolvedAt).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                </div>
            `;
        });

        container.innerHTML = html;

        // Show/hide "View More" button
        if (viewMoreContainer) {
            if (hasMore) {
                viewMoreContainer.classList.remove('hidden');
            } else {
                viewMoreContainer.classList.add('hidden');
            }
        }
    }

    showMainReportsView() {
        // Hide others, show full reports view
        if (this.mapContainer) this.mapContainer.classList.add('hidden');
        if (this.fullInventoryView) this.fullInventoryView.classList.add('hidden');
        if (this.fullReportsView) this.fullReportsView.classList.remove('hidden');

        // Update nav buttons
        this._updateNavActive('btn-reports');

        // Switch sidebar to message
        this.switchView('reportsMessage');

        this.currentMainReportsFilter = 'all';
        this.updateFilterButtons('main-filter');
        this.renderMainReports();
    }

    hideMainReportsView() {
        this.showMapView();
    }

    showMapView() {
        if (this.mapContainer) this.mapContainer.classList.remove('hidden');
        if (this.fullInventoryView) this.fullInventoryView.classList.add('hidden');
        if (this.fullReportsView) this.fullReportsView.classList.add('hidden');

        // Update nav buttons
        this._updateNavActive('btn-map');

        // Restore standard behavior: 'Map' button always brings back the list sidebar
        this.switchView('list');
    }

    _updateNavActive(activeId) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.id === activeId) btn.classList.add('active');
            else if (btn.id !== 'btn-admin-panel') btn.classList.remove('active');
        });
    }

    renderMainReports() {
        const container = document.getElementById('main-reports-list');
        const statsContainer = document.getElementById('main-reports-stats');
        const nodes = this.inventoryManager.getNodes();

        // Collect all reports from all nodes
        let allReports = [];
        nodes.forEach(node => {
            if (node.damageReports && node.damageReports.length > 0) {
                node.damageReports.forEach(report => {
                    allReports.push({
                        ...report,
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type
                    });
                });
            }
        });

        // Calculate stats before filtering
        const totalReports = allReports.length;
        const pendingReports = allReports.filter(r => !r.resolved).length;
        const resolvedReports = allReports.filter(r => r.resolved).length;

        // Apply filter
        if (this.currentMainReportsFilter === 'pending') {
            allReports = allReports.filter(r => !r.resolved);
        } else if (this.currentMainReportsFilter === 'resolved') {
            allReports = allReports.filter(r => r.resolved);
        }

        // Sort by date (newest first)
        allReports.sort((a, b) => new Date(b.reportedAt || b.timestamp) - new Date(a.reportedAt || a.timestamp));

        // Render stats
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div style="display: flex; justify-content: space-around; text-align: center;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold; color: #800020;">${totalReports}</div>
                        <div style="color: #666;">Total</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${pendingReports}</div>
                        <div style="color: #666;">Pendientes</div>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold; color: #28a745;">${resolvedReports}</div>
                        <div style="color: #666;">Resueltas</div>
                    </div>
                </div>
            `;
        }

        if (allReports.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay reportes en esta categoría.</p>';
            return;
        }

        // Render all reports (no limit)
        let html = '';
        allReports.forEach(report => {
            const date = new Date(report.reportedAt || report.timestamp);
            const dateStr = date.toLocaleString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = report.resolved ? 'resolved' : 'pending';
            const statusText = report.resolved ? 'Resuelto' : 'Pendiente';

            html += `
                <div class="report-item ${statusClass}" onclick="window.uiManager.navigateToNode('${report.nodeId}', true)">
                    <div class="report-header">
                        <span class="report-node-name">${report.nodeName} (${report.nodeType})</span>
                        <span class="report-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="report-description">${report.description}</div>
                    <div class="report-date">📅 ${dateStr}</div>
                    ${report.resolved ? `<div class="report-date" style="color: #28a745;">✓ Resuelto: ${new Date(report.resolvedAt).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - ${report.resolutionTime || 'N/A'}</div>` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    showMainInventoryView() {
        // Hide others, show inventory
        if (this.mapContainer) this.mapContainer.classList.add('hidden');
        if (this.fullReportsView) this.fullReportsView.classList.add('hidden');
        if (this.fullInventoryView) this.fullInventoryView.classList.remove('hidden');

        // Update nav buttons
        this._updateNavActive('btn-inventory');

        // Switch sidebar to message
        this.switchView('inventoryMessage');

        this.inventoryViewMode = 'summary'; // Reset to summary when opening
        this.renderInventory();
    }

    hideMainInventoryView() {
        this.showMapView();
    }

    renderInventory() {
        if (this.inventoryViewMode === 'summary') {
            this.renderInventorySummary();
        } else {
            this.renderInventoryCategory();
        }
    }

    renderInventorySummary() {
        let nodes = this.inventoryManager.getNodes();
        let connections = this.inventoryManager.getConnections();

        // Apply Search Filter if active
        if (this.inventorySearchQuery) {
            nodes = nodes.filter(n =>
                n.name.toLowerCase().includes(this.inventorySearchQuery) ||
                n.type.toLowerCase().includes(this.inventorySearchQuery)
            );
            connections = connections.filter(c =>
                (c.cableType || '').toLowerCase().includes(this.inventorySearchQuery) ||
                (c.identification || '').toLowerCase().includes(this.inventorySearchQuery)
            );
        }

        // 1. Group Nodes by Type
        const nodeGroups = {};
        nodes.forEach(n => {
            if (!nodeGroups[n.type]) nodeGroups[n.type] = [];
            nodeGroups[n.type].push(n);
        });

        // 2. Group Connections by Cable Type
        const connGroups = {};
        connections.forEach(c => {
            const type = c.cableType || 'OTRO';
            if (!connGroups[type]) connGroups[type] = [];
            connGroups[type].push(c);
        });

        // Update Stats Summary (Top 4 favorites)
        if (this.inventoryUI.stats) {
            let statsHtml = '';
            const displayFavs = ['TOTAL_NODES'];
            this.favoriteCategories.forEach(fav => {
                if (displayFavs.length < 4) displayFavs.push(fav);
            });

            displayFavs.forEach(fav => {
                let countLabel = '0';
                let label = fav;
                let color = '#333';

                if (nodeGroups[fav]) {
                    countLabel = nodeGroups[fav].length.toString();
                    color = this.mapManager.getColorForType(fav);
                    label = fav;
                } else if (connGroups[fav]) {
                    const group = connGroups[fav];
                    let dist = 0;
                    group.forEach(c => {
                        try { dist += this.mapManager.calculateDistance(c.path || []); } catch (e) { }
                    });
                    countLabel = `${(dist / 1000).toFixed(2)} km`;
                    label = `Cable ${fav}`;
                } else if (fav === 'TOTAL_NODES') {
                    countLabel = nodes.length.toString();
                    label = 'Total Equipos';
                    color = '#800020';
                } else if (fav === 'TOTAL_FIBER') {
                    let totalDist = 0;
                    connections.forEach(c => {
                        try { totalDist += this.mapManager.calculateDistance(c.path || []); } catch (e) { }
                    });
                    countLabel = `${(totalDist / 1000).toFixed(2)} km`;
                    label = 'Fibra Total';
                    color = '#e67e22';
                }

                statsHtml += `
                    <div class="stat-card">
                        <span class="value" style="color: ${color};">${countLabel}</span>
                        <span class="label">${label}</span>
                    </div>
                `;
            });
            this.inventoryUI.stats.innerHTML = statsHtml;
        }

        const container = this.inventoryUI.container;
        if (!container) return;
        container.innerHTML = '';

        // Render Node Categories
        if (this.inventoryTypeFilter === 'all' || this.inventoryTypeFilter === 'node') {
            const header = document.createElement('h3');
            header.innerText = 'Equipos y Terminales';
            header.style.gridColumn = '1 / -1';
            header.style.margin = '10px 0';
            container.appendChild(header);

            Object.keys(nodeGroups).sort().forEach(type => {
                const count = nodeGroups[type].length;
                const color = this.mapManager.getColorForType(type);
                const card = this.createCategoryCard(type, `${count} unidades`, color, () => {
                    this.inventoryViewMode = 'category';
                    this.currentInventoryCategory = type;
                    this.currentInventoryType = 'node';
                    this.renderInventory();
                });
                container.appendChild(card);
            });
        }

        // Render Cable Categories
        if (this.inventoryTypeFilter === 'all' || this.inventoryTypeFilter === 'connection') {
            const header = document.createElement('h3');
            header.innerText = 'Cables y Tendidos';
            header.style.gridColumn = '1 / -1';
            header.style.margin = '20px 0 10px 0';
            container.appendChild(header);

            Object.keys(connGroups).sort().forEach(type => {
                const group = connGroups[type];
                let dist = 0;
                group.forEach(c => {
                    try { dist += this.mapManager.calculateDistance(c.path || []); } catch (e) { }
                });

                const label = `${group.length} tramos - ${(dist / 1000).toFixed(2)} km`;
                const card = this.createCategoryCard(`Cable ${type}`, label, '#333', () => {
                    this.inventoryViewMode = 'category';
                    this.currentInventoryCategory = type;
                    this.currentInventoryType = 'connection';
                    this.renderInventory();
                });
                container.appendChild(card);
            });
        }
    }

    createCategoryCard(title, subtitle, color, onClick) {
        const isFav = this.favoriteCategories.includes(title);
        const card = document.createElement('div');
        card.className = 'inventory-card category-card';
        card.innerHTML = `
            <div class="inventory-card-header" style="justify-content: space-between;">
                <div>
                    <span class="inventory-card-title">${title}</span>
                </div>
                <span class="fav-icon" style="cursor: pointer; font-size: 20px;" 
                      onclick="event.stopPropagation(); window.uiManager.toggleFavorite('${title}')">
                      ${isFav ? '⭐' : '☆'}
                </span>
            </div>
            <div class="inventory-card-details">
                <p style="font-size: 16px; margin: 10px 0;"><strong>${subtitle}</strong></p>
                <p style="font-size: 12px; color: #888;">Haga clic para ver detalles →</p>
            </div>
        `;
        card.addEventListener('click', onClick);
        return card;
    }

    toggleFavorite(category) {
        const index = this.favoriteCategories.indexOf(category);
        if (index > -1) {
            this.favoriteCategories.splice(index, 1);
        } else {
            this.favoriteCategories.push(category);
        }
        localStorage.setItem('ultranet_favorites', JSON.stringify(this.favoriteCategories));
        this.renderInventory();
    }

    renderInventoryCategory() {
        const container = this.inventoryUI.container;
        if (!container) return;
        container.innerHTML = '';

        const backBtn = document.createElement('div');
        backBtn.className = 'inventory-list-item back-btn';
        backBtn.style.gridColumn = '1 / -1';
        backBtn.style.backgroundColor = '#f0f0f0';
        backBtn.style.padding = '10px';
        backBtn.style.cursor = 'pointer';
        backBtn.innerHTML = `<span><strong>← Volver al Resumen</strong> (${this.currentInventoryCategory})</span>`;
        backBtn.onclick = () => {
            this.inventoryViewMode = 'summary';
            this.renderInventory();
        };
        container.appendChild(backBtn);

        if (this.currentInventoryType === 'node') {
            let nodes = this.inventoryManager.getNodes().filter(n => n.type === this.currentInventoryCategory);

            if (this.inventorySearchQuery) {
                nodes = nodes.filter(n => n.name.toLowerCase().includes(this.inventorySearchQuery));
            }

            nodes.forEach(node => {
                const card = this.createItemCard(node.name, node.type, this.mapManager.getColorForType(node.type), () => {
                    this.navigateToNodeFromInventory(node.id);
                }, node.clientData ? `Plan: ${node.clientData.plan}` : `ID: ${node.id.substring(0, 8)}`);
                container.appendChild(card);
            });
        } else {
            let conns = this.inventoryManager.getConnections().filter(c => (c.cableType || 'OTRO') === this.currentInventoryCategory);

            if (this.inventorySearchQuery) {
                conns = conns.filter(c => (c.identification || '').toLowerCase().includes(this.inventorySearchQuery));
            }

            conns.forEach(conn => {
                const fromNode = this.inventoryManager.getNode(conn.from);
                const toNode = this.inventoryManager.getNode(conn.to);
                const distance = this.mapManager.calculateDistance(conn.path).toFixed(1);
                const title = conn.identification || `${fromNode?.name || '---'} ↔ ${toNode?.name || '---'}`;

                const card = this.createItemCard(title, `${conn.fibers} Hilos`, '#333', () => {
                    this.navigateToConnectionFromInventory(conn.id);
                }, `Metraje: ${distance} m<br>Tipo: ${conn.sectionType || 'N/A'}`);
                container.appendChild(card);
            });
        }
    }

    createItemCard(title, type, color, onClick, extraHtml) {
        const card = document.createElement('div');
        card.className = 'inventory-card';
        card.innerHTML = `
            <div class="inventory-card-header">
                <span class="inventory-card-title">${title}</span>
                <span class="inventory-card-type" style="background-color: ${color}">${type}</span>
            </div>
            <div class="inventory-card-details">
                <p>${extraHtml}</p>
            </div>
            <div class="inventory-card-footer">
                <span>📍 Ver en Mapa</span>
            </div>
        `;
        card.addEventListener('click', onClick);
        return card;
    }

    navigateToNodeFromInventory(nodeId) {
        this.hideMainInventoryView();
        this.navigateToNode(nodeId, true);
    }

    navigateToNode(nodeId, moveMap = false) {
        this.showNodeDetails(nodeId);
        const node = this.inventoryManager.getNode(nodeId);
        if (node && moveMap) {
            // Check if node is already visible to avoid jarring transitions
            const currentZoom = this.mapManager.map.getZoom();
            const targetZoom = Math.max(currentZoom, 18); // Allow up to 18, or keep current if higher
            this.mapManager.map.setView([node.lat, node.lng], targetZoom);
        }
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = document.getElementById('btn-map');
        if (btnMap) btnMap.classList.add('active');
    }

    navigateToNodeFromReports(nodeId) {
        this.hideMainReportsView();
        this.navigateToNode(nodeId, true);
    }

    navigateToConnectionFromInventory(connId) {
        this.hideMainInventoryView();
        this.navigateToConnection(connId, true);
    }

    navigateToConnection(connId, moveMap = false) {
        this.showConnectionDetails(connId);
        const conn = this.inventoryManager.getConnections().find(c => c.id == connId);
        if (conn && conn.path && conn.path.length > 0 && moveMap) {
            const bounds = L.polyline(conn.path).getBounds();
            // Allow higher zoom for short cables
            this.mapManager.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
        }
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const btnMap = document.getElementById('btn-map');
        if (btnMap) btnMap.classList.add('active');
    }


    resetForm() {
        this.form.form.reset();
        this.tempLocation = null;
        this.pendingSplitConnectionId = null;
        this.form.clientFields.classList.add('hidden');
    }
}


// ============================================================
// PlanoManager
// Full-screen image canvas mode for non-geographic projects
// (floor plans, building layouts, etc.)
// Uses Leaflet CRS.Simple so the image IS the coordinate space.
// ============================================================
class PlanoManager {
    constructor() {
        // Leaflet CRS.Simple instance (separate from geographic map)
        this.planoMap = null;
        this.imageOverlay = null;
        this.imageSize = { w: 0, h: 0 };
        this.imageBounds = null;   // [[0,0],[h,w]] pixel coords
        this.imageDataUrl = null;
        this.imageFileName = '';

        // Calibration (línea de cota)
        this.unit = 'm';
        this.cotaRealValue = 1;
        this.pixelsPerUnit = null;
        this.isCalibrated = false;

        // Cota drawing state
        this.cotaPoints = [];
        this.cotaMarkers = [];
        this.cotaPolyline = null;

        // Plano data (internals)
        this.planoNodes = [];       // {id, name, latlng} (without marker to serialize)
        this.planoConnections = []; // {id, name, points, distance, unit}
        this.nodeIdCounter = 1;
        this.connIdCounter = 1;

        // Link to geographic parent node
        this.parentNodeId = null;

        // Interaction mode
        this.mode = 'select'; // 'select' | 'add-node' | 'draw-cable' | 'draw-cota'
        this.cableWaypoints = [];
        this.cableTempPolyline = null;
        this._cableWaypointDots = [];

        this.isActive = false;
        this._initialized = false;
        this._pendingPlanoCoords = null;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Wire upload button → map placement mode
        const btnUpload = document.getElementById('btn-upload-map-image');
        const fileInput = document.getElementById('input-map-image');
        if (btnUpload && fileInput) {
            btnUpload.addEventListener('click', () => {
                this.startPlacingPlanoMode();
            });
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.loadImageFile(file, this._pendingPlanoCoords);
                    this._pendingPlanoCoords = null;
                }
                fileInput.value = '';
            });
        }

        // Plano toolbar buttons
        document.getElementById('btn-exit-plano')?.addEventListener('click', () => this.exitPlanoMode());
        document.getElementById('btn-plano-add-node')?.addEventListener('click', () => {
            if (window.uiManager) window.uiManager.startAddNodeFlow();
        });
        document.getElementById('btn-plano-draw-cable')?.addEventListener('click', () => {
            if (window.uiManager) window.uiManager.startStandaloneCablingFlow();
        });
        document.getElementById('btn-plano-draw-cota')?.addEventListener('click', () => this.setMode('draw-cota'));
        document.getElementById('btn-plano-finish-cable')?.addEventListener('click', () => this.finishCable());
        document.getElementById('btn-plano-cancel-cable')?.addEventListener('click', () => { this._cancelCable(); this.setMode('select'); });
        document.getElementById('btn-plano-clear')?.addEventListener('click', () => this._clearAll());
        document.getElementById('btn-plano-upload-new')?.addEventListener('click', () => fileInput && fileInput.click());

        console.log('📐 PlanoManager initialized');
    }

    // ── Image loading & Placement ───────────────────────────────
    startPlacingPlanoMode() {
        if (!window.inventoryManager || !window.inventoryManager.projectId) {
            alert('Por favor selecciona o crea un proyecto activo (Panel Admin) antes de crear Capas/Planos en el mapa.');
            return;
        }
        if (!window.mapManager || !window.mapManager.map) return;

        // Close dropdown if open
        document.getElementById('planos-dropdown')?.classList.add('hidden');

        // Show the geographic map if it's hidden (e.g. plano mode was active)
        document.getElementById('map')?.classList.remove('hidden');
        document.getElementById('plano-view')?.classList.add('hidden');

        // Use the current map center as location — no click required.
        // This avoids event-ordering issues where the map click is consumed
        // by the UIManager before the plano handler sees it.
        const center = window.mapManager.map.getCenter();
        this._pendingPlanoCoords = center;
        this._pendingParentNodeId = null;

        // Check if there's a nearby plano site at the map center
        const nearby = window.inventoryManager.getNodes().find(n =>
            n.customFields?.is_plano &&
            window.mapManager.map.distance(center, [n.lat, n.lng]) < 200
        );

        if (nearby) {
            if (confirm(`¿Deseas agregar una nueva CAPA/PISO al sitio existente "${nearby.name}"?`)) {
                this._pendingParentNodeId = nearby.id;
            }
            // else: create a new site at center
        }

        // Open file picker directly
        const fileInput = document.getElementById('input-map-image');
        if (fileInput) fileInput.click();

        // Non-blocking hint
        const statusEl = document.getElementById('map-status-msg');
        if (statusEl) {
            statusEl.textContent = '📂 Selecciona una imagen para el plano...';
            statusEl.style.display = 'block';
            setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
        }
    }

    loadImageFile(file, coords = null) {
        this.imageFileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const img = new Image();
            img.onload = async () => {
                this.imageSize = { w: img.naturalWidth, h: img.naturalHeight };

                let parentId = this._pendingParentNodeId;
                let layerId = 'layer-' + Date.now();
                let layerName = prompt('Nombre de la Capa o Piso:', parentId ? 'Nuevo Piso' : 'Planta Baja');
                if (layerName === null) return; // User cancelled
                if (!layerName) layerName = file.name.split('.')[0];

                // If no coords (map click was missed), use current map center
                if (!coords && window.mapManager?.map) {
                    coords = window.mapManager.map.getCenter();
                    console.log('ℹ️ No map coords provided, using map center:', coords);
                }

                if (!parentId && coords) {
                    // Create a new geographic site node
                    const siteName = 'Sitio: ' + (layerName || file.name.split('.')[0]);
                    const siteNode = {
                        id: 'plano-site-' + Date.now(),
                        name: siteName,
                        type: 'RACK',
                        lat: coords.lat,
                        lng: coords.lng,
                        customFields: {
                            is_plano: true,
                            layers: []
                        }
                    };
                    parentId = siteNode.id;
                    siteNode.customFields.layers.push({
                        id: layerId,
                        name: layerName,
                        dataUrl: dataUrl,
                        cota: null,
                        imageSize: this.imageSize
                    });
                    const added = await window.inventoryManager.addNode(siteNode);
                    if (!added) {
                        console.error('Failed to save plano site node');
                        return;
                    }
                    window.mapManager.addMarker(siteNode);
                    // Refresh list so the new site appears
                    if (window.uiManager) window.uiManager.refreshNodeList();
                } else if (parentId) {
                    // Add layer to existing site
                    const site = window.inventoryManager.getNode(parentId);
                    if (site) {
                        if (!site.customFields.layers) site.customFields.layers = [];

                        // Compatibility fix for old single-image planos
                        if (site.customFields.plano_data_url && site.customFields.layers.length === 0) {
                            site.customFields.layers.push({
                                id: 'layer-legacy',
                                name: 'Piso Original',
                                dataUrl: site.customFields.plano_data_url,
                                cota: site.customFields.cota || null
                            });
                        }

                        site.customFields.layers.push({
                            id: layerId,
                            name: layerName,
                            dataUrl: dataUrl,
                            cota: null,
                            imageSize: this.imageSize
                        });
                        await window.inventoryManager.updateNode(site);
                    }
                } else {
                    alert('No se pudo determinar la ubicación del plano. Intenta de nuevo haciendo clic en el mapa.');
                    return;
                }

                this._pendingParentNodeId = null;
                this._pendingPlanoCoords = null;
                this.enterPlanoMode(dataUrl, parentId, layerId);

                // Refresh the plano list in the dropdown
                this.refreshPlanoList();
            };
            img.onerror = () => {
                alert('No se pudo leer la imagen. Asegúrate de que el archivo es una imagen válida.');
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }

    // ── View switching ──────────────────────────────────────────
    refreshPlanoList() {
        const topContainer = document.getElementById('planos-list-container');
        const sideContainer = document.getElementById('sidebar-capas-list');

        if (!window.inventoryManager) return;

        const planos = window.inventoryManager.getNodes().filter(n => n.customFields && n.customFields.is_plano);

        if (topContainer) topContainer.innerHTML = '';
        if (sideContainer) sideContainer.innerHTML = '';

        if (planos.length === 0) {
            const emptyHtml = '<div style="padding: 10px; font-size: 12px; color: #999; text-align: center;">No hay planos en este proyecto</div>';
            if (topContainer) topContainer.innerHTML = emptyHtml;
            if (sideContainer) sideContainer.innerHTML = emptyHtml;
            return;
        }

        planos.forEach(plano => {
            const layers = plano.customFields.layers || [];
            const siteName = plano.name.replace('Sitio: ', '').replace('Plano: ', '');

            // For each layer...
            layers.forEach(layer => {
                const combinedName = `${siteName} - ${layer.name}`;
                const fullPlanoId = `${plano.id}_${layer.id}`;

                // Toolbar Dropdown
                if (topContainer) {
                    const btn = document.createElement('button');
                    btn.className = 'dropdown-item';
                    btn.style.cssText = 'width: 100%; text-align: left; padding: 10px; background: none; border: none; cursor: pointer; font-size: 12px; color: #333; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f5f5f5;';
                    btn.innerHTML = `<span style="font-size:16px;">🏢</span> <span>${combinedName}</span>`;
                    btn.addEventListener('click', () => {
                        document.getElementById('planos-dropdown')?.classList.add('hidden');
                        this.imageFileName = combinedName;
                        this.enterPlanoMode(layer.dataUrl, plano.id, layer.id);
                    });
                    topContainer.appendChild(btn);
                }

                // Sidebar list
                if (sideContainer) {
                    const btn2 = document.createElement('button');
                    btn2.className = 'action-btn';
                    btn2.style.cssText = 'background: #34495e; margin-bottom: 5px; text-align: left; font-size: 11px; padding: 8px;';
                    btn2.innerHTML = `🏢 ${combinedName}`;
                    btn2.addEventListener('click', () => {
                        this.imageFileName = combinedName;
                        this.enterPlanoMode(layer.dataUrl, plano.id, layer.id);
                    });
                    sideContainer.appendChild(btn2);
                }
            });

            // Handle legacy planos (without layers array)
            if (layers.length === 0 && plano.customFields.plano_data_url) {
                // ... logic to show legacy ...
                const btnLegacy = document.createElement('button');
                btnLegacy.className = 'action-btn';
                btnLegacy.style.background = '#7f8c8d';
                btnLegacy.innerText = `📦 ${siteName} (Legacy)`;
                btnLegacy.onclick = () => this.enterPlanoMode(plano.customFields.plano_data_url, plano.id, 'legacy');
                if (sideContainer) sideContainer.appendChild(btnLegacy);
            }
        });
    }

    enterPlanoMode(dataUrl, parentNodeId = null, layerId = 'default') {
        this.isActive = true;
        this.parentNodeId = parentNodeId;
        this.currentLayerId = layerId;
        this.fullPlanoId = `${parentNodeId}_${layerId}`;

        // Hide the geographic map and other views
        ['map', 'full-inventory-view', 'full-reports-view'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });

        // Show plano view
        document.getElementById('plano-view')?.classList.remove('hidden');

        // Update filename badge
        const fnEl = document.getElementById('plano-filename');
        if (fnEl) fnEl.textContent = '🖼️ ' + (this.imageFileName || 'Plano Interno');

        // Also show "← Salir del Plano" shortcut in sidebar cota panel
        const btnRemove = document.getElementById('btn-remove-map-image');
        if (btnRemove) btnRemove.style.display = 'block';

        // Hide common sections, show plano-specific ones
        document.getElementById('section-capas')?.classList.remove('hidden');
        document.getElementById('section-linea-cota')?.classList.remove('hidden');

        // Load existing elements if any
        if (this.parentNodeId && window.inventoryManager) {
            const node = window.inventoryManager.getNode(this.parentNodeId);
            if (node && node.customFields) {
                // Find layer config for cota
                const layer = (node.customFields.layers || []).find(l => l.id === this.currentLayerId);
                const cotaSource = layer ? layer.cota : (node.customFields.cota || null);

                if (cotaSource) {
                    this.isCalibrated = true;
                    this.unit = cotaSource.unit;
                    this.pixelsPerUnit = cotaSource.pixelsPerUnit;
                    this.cotaRealValue = cotaSource.realValue;
                } else {
                    this.isCalibrated = false;
                    this.pixelsPerUnit = null;
                }

                if (layer && layer.imageSize) {
                    this.imageSize = layer.imageSize;
                }
            }
        } else {
            this.isCalibrated = false;
            this.pixelsPerUnit = null;
        }

        // Build/re-build the Leaflet CRS.Simple map
        this._initPlanoMap(dataUrl);

        this._updateCalibrationUI();

        // Auto-open cota panel only if not calibrated
        if (!this.isCalibrated) {
            this.openCotaPanel();
        }

        this.setMode('select');
        console.log('📐 Entered plano mode. Parent Node:', this.parentNodeId);
    }

    exitPlanoMode() {
        this.isActive = false;
        this.setMode('select');

        // Hide plano view
        document.getElementById('plano-view')?.classList.add('hidden');
        document.getElementById('section-capas')?.classList.add('hidden');
        document.getElementById('section-linea-cota')?.classList.add('hidden');

        // Hide cota sidebar shortcut
        const btnRemove = document.getElementById('btn-remove-map-image');
        if (btnRemove) btnRemove.style.display = 'none';

        // Show geographic map
        document.getElementById('map')?.classList.remove('hidden');

        // Tell Leaflet to recalculate size after it was hidden
        if (window.mapManager?.map) {
            setTimeout(() => window.mapManager.map.invalidateSize(), 100);
        }

        // Restore geographic node/cable lists
        if (window.uiManager) {
            window.uiManager.refreshNodeList?.();
        }

        console.log('🗺️ Exited plano mode → geographic map restored');
    }

    _initPlanoMap(dataUrl) {
        const h = this.imageSize.h;
        const w = this.imageSize.w;
        this.imageBounds = [[0, 0], [h, w]];

        // Destroy previous instance if any
        if (this.planoMap) {
            this.planoMap.remove();
            this.planoMap = null;
        }

        // New Leaflet map using pixel coordinate system
        this.planoMap = L.map('plano-map', {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 5,
            zoomSnap: 0.25,
            zoomControl: true,
            attributionControl: false,
            doubleClickZoom: false   // We use dblclick to finish cable
        });

        // Place the image
        this.imageOverlay = L.imageOverlay(dataUrl, this.imageBounds, {
            opacity: 1,
            interactive: false
        }).addTo(this.planoMap);

        // Fit view to image
        this.planoMap.fitBounds(this.imageBounds, { padding: [10, 10] });

        // Interaction event listeners
        this.planoMap.on('click', (e) => this._onPlanoClick(e));
        this.planoMap.on('dblclick', (e) => {
            if (this.mode === 'draw-cable') {
                L.DomEvent.preventDefault(e);
                this.finishCable();
            }
        });
        this.planoMap.on('mousemove', (e) => this._onPlanoMouseMove(e));

        // Clear current active drawings
        this.cotaPoints = [];
        this.cotaMarkers = [];
        this.cotaPolyline = null;
        this.cableWaypoints = [];
        this._cableWaypointDots = [];

        // Render previously saved elements into Leaflet
        this._renderPlanoElementsToMap();
    }

    _renderPlanoElementsToMap() {
        if (!window.inventoryManager || !this.fullPlanoId || !this.planoMap) return;

        // Clear old layer group
        if (this._planoLayerGroup) {
            this.planoMap.removeLayer(this._planoLayerGroup);
        }
        this._planoLayerGroup = L.layerGroup().addTo(this.planoMap);

        // Fetch nodes and cables belonging to this specific site and layer
        const siteNodes = window.inventoryManager.getNodes().filter(n => n.customFields?.plano_id === this.fullPlanoId);
        const siteCables = window.inventoryManager.getConnections().filter(c => c.fiberDetails && c.fiberDetails.some(f => f.plano_id === this.fullPlanoId));

        // Shared Icon configuration
        const planoNodeIcon = L.divIcon({
            className: 'plano-node-icon',
            html: '<div style="background:#800020; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        // Render Nodes
        siteNodes.forEach(node => {
            const marker = L.marker([node.lat, node.lng], {
                icon: planoNodeIcon,
                title: node.name
            }).addTo(this._planoLayerGroup);

            let label = node.name;
            if (node.customFields?.height) label += ` [H: ${node.customFields.height}m]`;

            marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10], className: 'cable-dist-tooltip' });

            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                document.dispatchEvent(new CustomEvent('marker:clicked', { detail: node.id }));
            });
        });

        // Render Cables
        siteCables.forEach(conn => {
            const polyline = L.polyline(conn.path, { color: '#e67e22', weight: 4, opacity: 0.9 }).addTo(this._planoLayerGroup);

            if (this.isCalibrated && this.pixelsPerUnit) {
                const pxDist = this.calculatePolylineDistance(conn.path);
                const realDist = pxDist / this.pixelsPerUnit;

                // Add verticality if any node in the path has height
                let totalDist = realDist;
                const startNode = window.inventoryManager.getNode(conn.from);
                const endNode = window.inventoryManager.getNode(conn.to);

                if (startNode?.customFields?.height || endNode?.customFields?.height) {
                    const h1 = parseFloat(startNode?.customFields?.height || 0);
                    const h2 = parseFloat(endNode?.customFields?.height || 0);
                    const hDiff = Math.abs(h1 - h2);
                    totalDist = Math.sqrt(realDist * realDist + hDiff * hDiff);
                }

                const midPt = conn.path[Math.floor(conn.path.length / 2)];
                L.tooltip({ permanent: true, direction: 'center', className: 'cable-dist-tooltip' })
                    .setLatLng(midPt)
                    .setContent(`${conn.cableType}: ${totalDist.toFixed(2)} ${this.unit}`)
                    .addTo(this._planoLayerGroup);
            }

            polyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                document.dispatchEvent(new CustomEvent('connection:clicked', { detail: { id: conn.id, latlng: e.latlng } }));
            });
        });
    }

    updateTempPolyline(points) {
        if (this.cableTempPolyline) {
            this.planoMap.removeLayer(this.cableTempPolyline);
        }
        if (points.length > 0) {
            this.cableTempPolyline = L.polyline(points, { color: '#D4AF37', weight: 2, dashArray: '5, 10' }).addTo(this.planoMap);
        }
    }

    clearTempPolyline() {
        if (this.cableTempPolyline) {
            this.planoMap.removeLayer(this.cableTempPolyline);
            this.cableTempPolyline = null;
        }
    }

    calculatePolylineDistance(pts) {
        let dist = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const dx = pts[i + 1][1] - pts[i][1];
            const dy = pts[i + 1][0] - pts[i][0];
            dist += Math.sqrt(dx * dx + dy * dy);
        }
        return dist;
    }

    async _savePlanoStateToParentNode() {
        if (!this.parentNodeId || !window.inventoryManager) return;
        const node = window.inventoryManager.getNode(this.parentNodeId);
        if (node) {
            node.customFields = node.customFields || {};
            // Filter out leaflet objects before saving to DB
            const safeNodes = this.planoNodes.map(n => ({ id: n.id, name: n.name, latlng: n.latlng }));
            const safeCables = this.planoConnections.map(c => ({ id: c.id, name: c.name, points: c.points, distance: c.distance, unit: c.unit }));

            node.customFields.plano_elements = { nodes: safeNodes, cables: safeCables };
            await window.inventoryManager.updateNode(node);
            console.log('💾 Plano elements saved to parent node.');
        }
    }

    // ── Interaction modes ───────────────────────────────────────
    setMode(mode) {
        // Clean up previous mode artifacts
        if (this.mode === 'draw-cable' && mode !== 'draw-cable') this._cancelCable();
        if (this.mode === 'draw-cota' && mode !== 'draw-cota') this.cancelCotaDrawing();

        this.mode = mode;

        // Update toolbar button highlights
        ['btn-plano-add-node', 'btn-plano-draw-cable'].forEach(id => {
            document.getElementById(id)?.classList.remove('active-mode');
        });
        if (mode === 'add-node') document.getElementById('btn-plano-add-node')?.classList.add('active-mode');
        if (mode === 'draw-cable') document.getElementById('btn-plano-draw-cable')?.classList.add('active-mode');

        // Status label
        const labels = { select: 'Modo: Selección', 'add-node': 'Modo: Colocar Nodo — haz clic en el plano', 'draw-cable': 'Modo: Dibujar Cable — clic para puntos, doble clic para finalizar', 'draw-cota': 'Modo: Línea de Cota — selecciona 2 puntos' };
        const statusEl = document.getElementById('plano-status');
        if (statusEl) statusEl.textContent = labels[mode] || mode;

        // Cursor
        if (this.planoMap) {
            this.planoMap.getContainer().style.cursor = (mode === 'select') ? 'grab' : 'crosshair';
        }
    }

    _onPlanoClick(e) {
        if (this.mode === 'draw-cota') {
            this._addCotaPoint(e.latlng);
        } else {
            // Unify with global UIManager handlers
            const evt = new CustomEvent('map:clicked', { detail: e.latlng });
            document.dispatchEvent(evt);
        }
    }

    _onPlanoMouseMove(e) {
        // Broadcast mouse move for global UI feedback (like cable path preview)
        const evt = new CustomEvent('map:mousemove', { detail: e.latlng });
        document.dispatchEvent(evt);

        // Internal cota preview
        if (this.mode === 'draw-cota' && this.cotaPoints.length === 1) {
            const pts = [this.cotaPoints[0], e.latlng];
            if (this.cotaPolyline) this.planoMap.removeLayer(this.cotaPolyline);
            this.cotaPolyline = L.polyline(pts, {
                color: '#e67e22', weight: 2, dashArray: '5, 8'
            }).addTo(this.planoMap);
        }
    }

    // Removal of internal placement logic to favor unified global flow
    _clearAll() {
        if (confirm('¿Limpiar todos los elementos de este plano?')) {
            // Logic to delete nodes/cables with this fullPlanoId would go here
            console.warn('Cleanup requested for:', this.fullPlanoId);
        }
    }

    finishCable() {
        // Obsoleted by global UIManager.completeConnection
        this.setMode('select');
    }

    _cancelCable() {
        this.clearTempPolyline();
        this.setMode('select');
    }

    _clearAll() {
        if (!confirm('¿Limpiar todos los elementos visibles de este plano?')) return;
        // Optimization: Individual deletion logic could be added here
        console.warn('Cleanup requested for:', this.fullPlanoId);
    }

    // ── Calibration math ────────────────────────────────────────
    _measurePoints(latlngs) {
        if (!this.pixelsPerUnit || latlngs.length < 2) return 0;
        return this.calculatePolylineDistance(latlngs) / this.pixelsPerUnit;
    }

    // ── Línea de Cota ───────────────────────────────────────────
    toggleCotaPanel() {
        const panel = document.getElementById('cota-panel');
        const icon = document.getElementById('cota-toggle-icon');
        if (!panel) return;
        const open = panel.classList.contains('open');
        panel.classList.toggle('open', !open);
        icon?.classList.toggle('open', !open);
    }

    openCotaPanel() {
        document.getElementById('cota-panel')?.classList.add('open');
        document.getElementById('cota-toggle-icon')?.classList.add('open');
    }

    setUnit(unit, btnEl) {
        this.unit = unit;
        document.querySelectorAll('.cota-unit-btn').forEach(b => b.classList.remove('active'));
        btnEl?.classList.add('active');
        const lbl = document.getElementById('cota-unit-label');
        if (lbl) lbl.textContent = unit;
        this._updateCalibrationUI();
    }

    startCotaDrawing() {
        if (!this.isActive || !this.planoMap) {
            alert('Por favor, carga primero una imagen en modo Plano.');
            return;
        }
        const val = parseFloat(document.getElementById('input-cota-value')?.value);
        if (!val || val <= 0) { alert('Ingresa un valor real válido.'); return; }
        this.cotaRealValue = val;

        this._clearCotaDrawing();
        this.setMode('draw-cota');
        document.getElementById('cota-drawing-banner')?.classList.remove('hidden');
    }

    cancelCotaDrawing() {
        this._clearCotaDrawing();
        document.getElementById('cota-drawing-banner')?.classList.add('hidden');
        if (this.mode === 'draw-cota') this.setMode('select');
    }

    _addCotaPoint(latlng) {
        if (this.cotaPoints.length >= 2) return;

        this.cotaPoints.push(latlng);

        // Visual marker
        const cotaIcon = L.divIcon({
            className: 'cota-point-icon',
            html: '<div style="background:#9b59b6; width:10px; height:10px; border-radius:50%; border:1px solid white;"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });

        const dot = L.marker([latlng.lat, latlng.lng], { icon: cotaIcon, interactive: false }).addTo(this.planoMap);
        this.cotaMarkers.push(dot);

        if (this.cotaPoints.length > 1) {
            if (this.cotaPolyline) this.planoMap.removeLayer(this.cotaPolyline);
            this.cotaPolyline = L.polyline(this.cotaPoints, {
                color: '#e67e22', weight: 2.5, dashArray: '6, 4'
            }).addTo(this.planoMap);
        }

        if (this.cotaPoints.length === 2) this._finalizeCotaCalibration();
    }

    _finalizeCotaCalibration() {
        const p1 = this.cotaPoints[0], p2 = this.cotaPoints[1];
        // CRS.Simple: lng = x, lat = y
        const dx = p2.lng - p1.lng, dy = p2.lat - p1.lat;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);

        if (pixelDist < 5) {
            alert('Línea muy corta. Traza una línea más larga sobre el plano.');
            this._clearCotaDrawing();
            this.cancelCotaDrawing();
            return;
        }

        this.pixelsPerUnit = pixelDist / this.cotaRealValue;
        this.isCalibrated = true;

        // Save cota calibration to specific layer within parent node
        if (this.parentNodeId && window.inventoryManager) {
            const node = window.inventoryManager.getNode(this.parentNodeId);
            if (node && node.customFields?.layers) {
                const layer = node.customFields.layers.find(l => l.id === this.currentLayerId);
                if (layer) {
                    layer.cota = {
                        unit: this.unit,
                        realValue: this.cotaRealValue,
                        pixelsPerUnit: this.pixelsPerUnit
                    };
                    window.inventoryManager.updateNode(node);
                }
            }
        }

        document.getElementById('cota-drawing-banner')?.classList.add('hidden');

        const resultDiv = document.getElementById('cota-result');
        const resultText = document.getElementById('cota-result-text');
        if (resultDiv && resultText) {
            resultText.textContent = `Línea: ${pixelDist.toFixed(1)} px ≈ ${this.cotaRealValue} ${this.unit}`;
            resultDiv.classList.remove('hidden');
        }

        this._updateCalibrationUI();
        this.setMode('select');
        console.log(`✅ Calibrado: ${pixelDist.toFixed(1)} px = ${this.cotaRealValue} ${this.unit}  →  ${this.pixelsPerUnit.toFixed(3)} px/${this.unit}`);
    }

    _clearCotaDrawing() {
        this.cotaMarkers.forEach(m => this.planoMap?.removeLayer(m));
        this.cotaMarkers = [];
        if (this.cotaPolyline) { this.planoMap?.removeLayer(this.cotaPolyline); this.cotaPolyline = null; }
        this.cotaPoints = [];
    }

    _updateCalibrationUI() {
        const badge = document.getElementById('cota-calibrated-badge');
        const scaleEl = document.getElementById('cota-scale-display');
        if (this.isCalibrated && badge && scaleEl) {
            scaleEl.textContent = `1 px ≈ ${(1 / this.pixelsPerUnit).toFixed(4)} ${this.unit}`;
            badge.classList.remove('hidden');
        } else {
            badge?.classList.add('hidden');
        }
    }

    // Obsoleted
    _refreshPlanoLists() {
        if (window.uiManager) window.uiManager.refreshNodeList();
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
    adminManager.init();

    // Initialize Plano Manager (image canvas mode for floor plans)
    const planoManager = new PlanoManager();
    planoManager.init();
    window.planoManager = planoManager;

    // Expose for debugging/testing
    window.mapManager = mapManager;
    window.inventoryManager = inventoryManager;
    window.uiManager = uiManager;
    window.userManager = userManager;
    window.authManager = userManager; // Alias for backward compatibility or different naming
});
