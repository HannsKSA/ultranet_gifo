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
        if (this.markers[node.id]) {
            this.map.removeLayer(this.markers[node.id]);
        }

        // Custom icon based on type
        let iconColor = this.getColorForType(node.type);
        let iconHtml = `<div style="background-color: ${iconColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5);"></div>`;

        if (node.type === 'ONU') {
            iconHtml = `<div style="background-color: ${iconColor}; width: 12px; height: 12px; border-radius: 2px; border: 1px solid white;">🏠</div>`;
        }

        const marker = L.marker([node.lat, node.lng], {
            icon: L.divIcon({
                className: 'custom-node-icon',
                html: iconHtml,
                iconSize: [16, 16]
            })
        }).addTo(this.map);

        marker.bindTooltip(node.name, { permanent: false, direction: 'top' });

        marker.on('click', () => {
            document.dispatchEvent(new CustomEvent('marker:clicked', { detail: node.id }));
        });

        this.markers[node.id] = marker;
        return marker;
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
        }

        const polyline = L.polyline(connection.path, { color: color, weight: weight, opacity: 0.7 }).addTo(this.map);

        const distance = this.calculateDistance(connection.path);

        let popupContent = `<strong>Cable ${connection.cableType || 'General'}</strong><br>`;
        if (connection.fibers) popupContent += `Hilos: ${connection.fibers}<br>`;
        popupContent += `Distancia: ${distance.toFixed(2)} m`;

        polyline.bindPopup(popupContent);

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
}

class InventoryManager {
    constructor() {
        this.nodes = JSON.parse(localStorage.getItem('sgifo_nodes')) || [];
        this.connections = JSON.parse(localStorage.getItem('sgifo_connections')) || [];
    }

    // Nodes
    addNode(node) {
        // Ensure rack property exists
        if (!node.rack) node.rack = [];
        this.nodes.push(node);
        this.save();
        return node;
    }

    getNode(id) {
        return this.nodes.find(n => n.id === id);
    }

    updateNode(updatedNode) {
        const index = this.nodes.findIndex(n => n.id === updatedNode.id);
        if (index !== -1) {
            this.nodes[index] = updatedNode;
            this.save();
        }
    }

    deleteNode(id) {
        this.nodes = this.nodes.filter(n => n.id !== id);
        this.connections = this.connections.filter(c => c.from !== id && c.to !== id);
        this.save();
    }

    getNodes() {
        return this.nodes;
    }

    // Connections
    addConnection(fromId, toId, path, cableType, fibers) {
        const newConnection = {
            id: Date.now().toString(),
            from: fromId,
            to: toId,
            path: path, // Array of [lat, lng]
            cableType: cableType,
            fibers: fibers
        };
        this.connections.push(newConnection);
        this.save();
        return newConnection;
    }

    getConnections() {
        return this.connections;
    }

    // Rack Management
    addEquipmentToRack(nodeId, equipment) {
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
            this.updateNode(node);
        }
    }

    getEquipment(nodeId, equipmentId) {
        const node = this.getNode(nodeId);
        if (!node || !node.rack) return null;
        return node.rack.find(e => e.id === equipmentId);
    }

    patchPorts(nodeId, equip1Id, port1Id, equip2Id, port2Id) {
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

                this.updateNode(node);
                return true;
            }
        }
        return false;
    }

    // Phase 4: Downstream Analysis
    getDownstreamImpact(startNodeId) {
        const affectedNodes = new Set();
        const affectedConnections = new Set();

        const traverse = (currentId) => {
            // Find all connections starting from currentId
            const outgoing = this.connections.filter(c => c.from === currentId);

            outgoing.forEach(conn => {
                affectedConnections.add(conn.id);
                if (!affectedNodes.has(conn.to)) {
                    affectedNodes.add(conn.to);
                    traverse(conn.to); // Recursive step
                }
            });
        };

        traverse(startNodeId);

        return {
            nodes: Array.from(affectedNodes).map(id => this.getNode(id)),
            connectionIds: Array.from(affectedConnections)
        };
    }

    save() {
        localStorage.setItem('sgifo_nodes', JSON.stringify(this.nodes));
        localStorage.setItem('sgifo_connections', JSON.stringify(this.connections));
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
            ports: document.getElementById('view-port-management')
        };

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
            impactList: document.getElementById('impact-list')
        };

        this.rackView = {
            nodeName: document.getElementById('rack-node-name'),
            list: document.getElementById('rack-equipment-list'),
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
            equipment: document.getElementById('modal-equipment')
        };

        this.modalForms = {
            connection: document.getElementById('form-connection'),
            equipment: document.getElementById('form-equipment'),
            connCableType: document.getElementById('conn-cable-type'),
            connFibers: document.getElementById('conn-fibers'),
            equipName: document.getElementById('equip-name'),
            equipType: document.getElementById('equip-type'),
            equipPorts: document.getElementById('equip-ports'),
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

        // State for Patching Wizard
        this.wizardState = {
            sourceEquipId: null,
            sourcePortId: null,
            targetEquipId: null
        };


    }

    init() {
        this.setupEventListeners();
        this.loadExistingData();
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
        this.form.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNode();
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
        this.modalForms.btnCancelConn.addEventListener('click', () => this.closeModal('connection'));
        this.modalForms.btnCancelEquip.addEventListener('click', () => this.closeModal('equipment'));

        this.modalForms.connection.addEventListener('submit', (e) => {
            e.preventDefault();
            this.finalizeConnection();
        });

        this.modalForms.equipment.addEventListener('submit', (e) => {
            e.preventDefault();
            this.finalizeAddEquipment();
        });

        // Patching Wizard Actions
        this.patchingUI.btnConnect.addEventListener('click', () => this.wizardGoToStep2());
        this.patchingUI.btnBack1.addEventListener('click', () => this.wizardGoToStep1());
        this.patchingUI.btnBack2.addEventListener('click', () => this.wizardGoToStep2());
        this.patchingUI.btnClose.addEventListener('click', () => this.closePatchingModal());
        this.patchingUI.btnDisconnect.addEventListener('click', () => this.disconnectPort());
    }

    closeModal(modalName) {
        this.modals[modalName].classList.add('hidden');
    }

    showConnectionModal() {
        this.modals.connection.classList.remove('hidden');
    }

    showEquipmentModal() {
        this.modals.equipment.classList.remove('hidden');
        this.modalForms.equipName.focus();
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

    saveNode() {
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

        this.inventoryManager.addNode(newNode);
        this.mapManager.addMarker(newNode);

        this.isAddingNode = false;
        this.switchView('list');
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
        if (!this.isConnecting || !this.connectionSourceId) return;

        if (targetNodeId === this.connectionSourceId) {
            alert("No puedes conectar un nodo consigo mismo.");
            return;
        }

        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        const targetNode = this.inventoryManager.getNode(targetNodeId);

        if (sourceNode && targetNode) {
            this.pendingConnectionTarget = targetNode;
            this.showConnectionModal();
        }
    }

    finalizeConnection() {
        if (!this.pendingConnectionTarget || !this.connectionSourceId) return;

        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        const targetNode = this.pendingConnectionTarget;

        const cableType = this.modalForms.connCableType.value;
        const fibers = this.modalForms.connFibers.value;

        // Add target as final point
        this.connectionWaypoints.push([targetNode.lat, targetNode.lng]);

        const conn = this.inventoryManager.addConnection(
            sourceNode.id,
            targetNode.id,
            this.connectionWaypoints,
            cableType,
            fibers
        );
        this.mapManager.addConnection(conn);

        const distance = this.mapManager.calculateDistance(this.connectionWaypoints);
        // alert(`Conexión creada: ${sourceNode.name} -> ${targetNode.name}\nDistancia: ${distance.toFixed(2)}m\nTipo: ${cableType} (${fibers} hilos)`);

        this.closeModal('connection');
        this.cancelConnectionFlow();
        this.pendingConnectionTarget = null;
    }


    cancelConnectionFlow() {
        this.isConnecting = false;
        this.connectionSourceId = null;
        this.connectionWaypoints = [];
        this.mapManager.clearTempPolyline();
        this.details.btnConnect.textContent = "🔗 Conectar";
        this.details.btnConnect.disabled = false;
        alert("Modo Trazado Cancelado.");
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

    finalizeAddEquipment() {
        const name = this.modalForms.equipName.value;
        const type = this.modalForms.equipType.value;
        const ports = this.modalForms.equipPorts.value;

        if (!name) return;

        const equipment = {
            id: Date.now().toString(),
            name: name,
            type: type,
            totalPorts: ports
        };

        this.inventoryManager.addEquipmentToRack(this.currentRackNodeId, equipment);
        this.renderRackList(this.inventoryManager.getNode(this.currentRackNodeId));

        this.closeModal('equipment');
        this.modalForms.equipment.reset();
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
            portEl.textContent = port.number;

            // Styling based on status
            if (port.status === 'connected') {
                portEl.style.backgroundColor = '#2ecc71';
                portEl.style.color = 'white';
                portEl.title = `Conectado a: ${port.connectedTo.equipName} (P${port.connectedTo.portId.split('-p')[1]})`;
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
            this.patchingUI.portInfo.innerHTML = `Estado: <span style="color:green">Conectado</span><br>Destino: ${port.connectedTo.equipName}`;
            this.patchingUI.btnConnect.classList.add('hidden');
            this.patchingUI.btnDisconnect.classList.remove('hidden');
        } else {
            this.patchingUI.portInfo.innerHTML = `Estado: <span style="color:grey">Libre</span>`;
            this.patchingUI.btnConnect.classList.remove('hidden');
            this.patchingUI.btnDisconnect.classList.add('hidden');
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
                btn.addEventListener('click', () => this.executeConnection(port.id));
            }
            grid.appendChild(btn);
        });

        this.patchingUI.step2.classList.add('hidden');
        this.patchingUI.step3.classList.remove('hidden');
    }

    executeConnection(targetPortId) {
        const success = this.inventoryManager.patchPorts(
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

    disconnectPort() {
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

            // Disconnect target
            const targetEquip = node.rack.find(e => e.id === targetInfo.equipId);
            if (targetEquip) {
                const targetPort = targetEquip.ports.find(p => p.id === targetInfo.portId);
                if (targetPort) {
                    targetPort.status = 'free';
                    targetPort.connectedTo = null;
                }
            }

            this.inventoryManager.updateNode(node);
            alert("Puerto desconectado.");
            this.closePatchingModal();
        }
    }
    // --- Damage Report Logic ---
    reportDamage() {
        if (!this.currentNodeId) return;

        const impact = this.inventoryManager.getDownstreamImpact(this.currentNodeId);

        // Highlight on map
        this.mapManager.resetNetworkStyles();
        this.mapManager.highlightAffectedNetwork(
            impact.nodes.map(n => n.id),
            impact.connectionIds
        );

        // Show results in sidebar
        this.details.reportResults.classList.remove('hidden');
        this.details.impactSummary.textContent = `Se encontraron ${impact.nodes.length} equipos afectados aguas abajo.`;

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

        // Show/Hide Rack Button only for RACK type
        if (node.type === 'RACK') {
            this.details.btnViewRack.classList.remove('hidden');
        } else {
            this.details.btnViewRack.classList.add('hidden');
        }

        // Hide previous reports
        this.details.reportResults.classList.add('hidden');
        this.mapManager.resetNetworkStyles();

        this.switchView('details');
    }

    deleteCurrentNode() {
        if (this.currentNodeId) {
            // Remove connections first visually
            const connections = this.inventoryManager.getConnections();
            connections.forEach(c => {
                if (c.from === this.currentNodeId || c.to === this.currentNodeId) {
                    this.mapManager.removeConnection(c.id);
                }
            });

            this.inventoryManager.deleteNode(this.currentNodeId);
            this.mapManager.removeMarker(this.currentNodeId);
            this.switchView('list');
            this.refreshNodeList();
            this.currentNodeId = null;
        }
    }

    loadExistingData() {
        // Load Nodes
        const nodes = this.inventoryManager.getNodes();
        nodes.forEach(node => {
            this.mapManager.addMarker(node);
        });
        this.refreshNodeList();

        // Load Connections
        const connections = this.inventoryManager.getConnections();
        connections.forEach(conn => {
            this.mapManager.addConnection(conn);
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
    const uiManager = new UIManager(mapManager, inventoryManager);
    uiManager.init();

    // Expose for debugging/testing
    window.mapManager = mapManager;
    window.inventoryManager = inventoryManager;
    window.uiManager = uiManager;
});
