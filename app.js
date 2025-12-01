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

        // Check if node has connections
        const hasConnections = this.hasNodeConnections(node.id);
        const warningIcon = hasConnections ? '' : '<div style="position:absolute; top:-8px; right:-8px; font-size:12px;">⚠️</div>';

        // Check Provider Connectivity (if has connections)
        let internetIcon = '';
        if (hasConnections && window.inventoryManagerRef) {
            const hasInternet = window.inventoryManagerRef.checkProviderConnectivity(node.id);
            if (!hasInternet) {
                internetIcon = '<div style="position:absolute; bottom:-5px; right:-5px; font-size:10px;" title="Sin Acceso a Internet">🌐🚫</div>';
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

class InventoryManager {
    constructor() {
        this.nodes = JSON.parse(localStorage.getItem('sgifo_nodes')) || [];
        this.connections = JSON.parse(localStorage.getItem('sgifo_connections')) || [];
    }

    // Nodes
    addNode(node) {
        // Ensure rack property exists
        if (!node.rack) node.rack = [];
        // Ensure splitters property exists for MUFLA nodes
        if (node.type === 'MUFLA' && !node.splitters) node.splitters = [];
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
    addConnection(fromId, toId, path, cableType, fibers, fromPort, toPort) {
        const newConnection = {
            id: Date.now().toString(),
            from: fromId,
            to: toId,
            path: path, // Array of [lat, lng]
            cableType: cableType,
            fibers: fibers,
            fromPort: fromPort || null, // { equipId, portId } for RACK nodes
            toPort: toPort || null,      // { equipId, portId } for RACK nodes
            fiberDetails: this.initializeFiberDetails(parseInt(fibers)) // Initialize fiber array
        };
        this.connections.push(newConnection);
        this.save();
        return newConnection;
    }

    initializeFiberDetails(fiberCount) {
        const colors = ['Azul', 'Naranja', 'Verde', 'Marrón', 'Gris', 'Blanco',
            'Rojo', 'Negro', 'Amarillo', 'Violeta', 'Rosa', 'Aguamarina'];
        const fibers = [];
        for (let i = 1; i <= fiberCount; i++) {
            fibers.push({
                number: i,
                color: colors[(i - 1) % colors.length],
                used: false,
                fromTermination: null, // { nodeId, splitterId, port }
                toTermination: null    // { nodeId, equipId, portId }
            });
        }
        return fibers;
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

    // Splitter Management
    addSplitterToNode(nodeId, splitter) {
        const node = this.getNode(nodeId);
        if (node && node.type === 'MUFLA') {
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
            this.updateNode(node);
            return splitter;
        }
        return null;
    }

    getSplitter(nodeId, splitterId) {
        const node = this.getNode(nodeId);
        if (!node || !node.splitters) return null;
        return node.splitters.find(s => s.id === splitterId);
    }

    deleteSplitter(nodeId, splitterId) {
        const node = this.getNode(nodeId);
        if (node && node.splitters) {
            node.splitters = node.splitters.filter(s => s.id !== splitterId);
            this.updateNode(node);
        }
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

    checkProviderConnectivity(startNodeId) {
        // BFS to find if connected to a Provider Router
        const visited = new Set();
        const queue = [startNodeId];
        visited.add(startNodeId);

        while (queue.length > 0) {
            const nodeId = queue.shift();
            const node = this.getNode(nodeId);

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
            ports: document.getElementById('view-port-management'),
            connection: document.getElementById('view-connection-details'),
            splitter: document.getElementById('view-splitter-management')
        };

        this.connectionDetails = {
            title: document.getElementById('connection-detail-title'),
            fromName: document.getElementById('conn-from-name'),
            toName: document.getElementById('conn-to-name'),
            cableType: document.getElementById('conn-cable-type-display'),
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
            connFibers: document.getElementById('conn-fibers'),
            equipName: document.getElementById('equip-name'),
            equipType: document.getElementById('equip-type'),
            equipPorts: document.getElementById('equip-ports'),
            equipIsProvider: document.getElementById('equip-is-provider'),
            equipProviderGroup: document.getElementById('equip-provider-group'),
            btnCancelConn: document.getElementById('btn-cancel-connection'),
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
            portsInfo: document.getElementById('splitter-ports-info'),
            inputFiber: document.getElementById('splitter-input-fiber'),
            outputGrid: document.getElementById('splitter-output-grid'),
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

        // Connection Details Actions
        this.connectionDetails.btnClose.addEventListener('click', () => this.switchView('list'));
        this.connectionDetails.btnEdit.addEventListener('click', () => this.editConnection());
        this.connectionDetails.btnDelete.addEventListener('click', () => this.deleteConnection());

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
        this.splitterModals.formAddSplitter.addEventListener('submit', (e) => {
            e.preventDefault();
            this.finalizeAddSplitter();
        });
        this.splitterModals.inputConnection.addEventListener('change', () => this.handleSplitterInputConnectionChange());

        this.splitterModals.btnClosePorts.addEventListener('click', () => this.splitterModals.splitterPorts.classList.add('hidden'));
        this.splitterModals.btnDeleteSplitter.addEventListener('click', () => this.deleteSplitter());

        this.splitterModals.btnCancelFiberConn.addEventListener('click', () => this.splitterModals.fiberConnection.classList.add('hidden'));
        this.splitterModals.btnFiberNext.addEventListener('click', () => this.fiberConnGoToStep2());
        this.splitterModals.btnFiberBack1.addEventListener('click', () => this.fiberConnGoToStep1());
        this.splitterModals.btnFiberBack2.addEventListener('click', () => this.fiberConnGoToStep2());
        this.splitterModals.fiberDestNode.addEventListener('change', () => this.handleFiberDestNodeChange());
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

    finalizeConnection() {
        if (!this.pendingConnectionTarget || !this.connectionSourceId) return;

        const sourceNode = this.inventoryManager.getNode(this.connectionSourceId);
        const targetNode = this.pendingConnectionTarget;

        const cableType = this.modalForms.connCableType.value;
        const fibers = this.modalForms.connFibers.value;

        // Add target as final point
        this.connectionWaypoints.push([targetNode.lat, targetNode.lng]);

        // Determine port info
        const fromPort = sourceNode.type === 'RACK' ? this.selectedSourcePort : null;
        const toPort = targetNode.type === 'RACK' ? this.selectedTargetPort : null;

        const conn = this.inventoryManager.addConnection(
            sourceNode.id,
            targetNode.id,
            this.connectionWaypoints,
            cableType,
            fibers,
            fromPort,
            toPort
        );
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

    finalizeAddEquipment() {
        const name = this.modalForms.equipName.value;
        const type = this.modalForms.equipType.value;
        const ports = this.modalForms.equipPorts.value;
        const isProvider = this.modalForms.equipIsProvider.checked;

        if (!name) return;

        const equipment = {
            id: Date.now().toString(),
            name: name,
            type: type,
            totalPorts: ports,
            isProvider: (type === 'ROUTER' && isProvider)
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

            this.inventoryManager.updateNode(node);
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

    finalizeEditConnection() {
        if (!this.editingConnectionId) return;

        const connections = this.inventoryManager.getConnections();
        const connection = connections.find(c => c.id === this.editingConnectionId);

        if (connection) {
            connection.cableType = this.modalForms.connCableType.value;
            connection.fibers = this.modalForms.connFibers.value;

            this.inventoryManager.save();

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

    deleteConnection() {
        if (this.currentConnectionId) {
            if (confirm('¿Estás seguro de eliminar esta conexión?')) {
                this.inventoryManager.deleteConnection(this.currentConnectionId);
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

        if (node.type === 'MUFLA') {
            btnViewSplitters.classList.remove('hidden');
        } else {
            btnViewSplitters.classList.add('hidden');
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

            const btnPorts = document.createElement('button');
            btnPorts.className = 'btn-secondary';
            btnPorts.textContent = 'Puertos';
            btnPorts.style.padding = '4px 8px';
            btnPorts.style.fontSize = '12px';
            btnPorts.onclick = (e) => {
                e.stopPropagation();
                this.showSplitterPorts(splitter.id);
            };

            item.appendChild(info);
            item.appendChild(btnPorts);
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
            connection.fiberDetails.forEach(fiber => {
                const item = document.createElement('div');
                item.className = `fiber-item ${fiber.used ? 'used' : ''}`;
                item.innerHTML = `
                    <div class="fiber-color ${fiber.color.toLowerCase()}"></div>
                    <span>Hilo ${fiber.number}</span>
                `;

                if (!fiber.used) {
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

    finalizeAddSplitter() {
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

        // Mark fiber as used
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);
        const fiber = connection.fiberDetails.find(f => f.number === this.selectedFiber.number);
        fiber.used = true;
        fiber.toTermination = {
            nodeId: this.currentSplitterNodeId,
            splitterId: splitter.id,
            port: 'input'
        };
        this.inventoryManager.save();

        this.inventoryManager.addSplitterToNode(this.currentSplitterNodeId, splitter);

        this.splitterModals.addSplitter.classList.add('hidden');
        this.renderSplitterList(this.inventoryManager.getNode(this.currentSplitterNodeId));
        this.selectedFiber = null;
    }

    showSplitterPorts(splitterId) {
        this.currentSplitterId = splitterId;
        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, splitterId);

        this.splitterModals.inputFiber.textContent = `Hilo ${splitter.inputFiber.fiberNumber} (${splitter.inputFiber.color})`;
        this.splitterModals.inputFiber.style.color = splitter.inputFiber.color;

        const grid = this.splitterModals.outputGrid;
        grid.innerHTML = '';

        splitter.outputPorts.forEach(port => {
            const btn = document.createElement('div');
            btn.className = 'port-item';
            btn.textContent = port.portNumber;

            if (port.used) {
                btn.style.backgroundColor = '#2ecc71';
                btn.style.color = 'white';
                // Find connected info
                if (port.connectedTo) {
                    btn.title = `Conectado via hilo ${port.connectedTo.fiberNumber}`;
                }
            } else {
                btn.style.backgroundColor = '#eee';
            }

            btn.onclick = () => this.openFiberConnectionModal(port);
            grid.appendChild(btn);
        });

        this.splitterModals.splitterPorts.classList.remove('hidden');
    }

    deleteSplitter() {
        if (!confirm('¿Estás seguro de eliminar este splitter? Se desconectarán todos los hilos.')) return;

        const splitter = this.inventoryManager.getSplitter(this.currentSplitterNodeId, this.currentSplitterId);

        // Free input fiber
        const conn = this.inventoryManager.getConnections().find(c => c.id === splitter.inputFiber.connectionId);
        if (conn) {
            const fiber = conn.fiberDetails.find(f => f.number === splitter.inputFiber.fiberNumber);
            if (fiber) {
                fiber.used = false;
                fiber.toTermination = null;
            }
        }

        // Free output connections (TODO: Implement logic to free downstream fibers)

        this.inventoryManager.deleteSplitter(this.currentSplitterNodeId, this.currentSplitterId);
        this.inventoryManager.save();

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
        // Logic to select fiber in the outgoing cable will be needed here
        // For now, we assume auto-selection of next available fiber or manual selection
        // This part requires more UI to select which fiber of the outgoing cable to use
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

        if (node.type === 'RACK') {
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
            // If not rack (e.g. another MUFLA or NAP), logic might differ
            alert('Por ahora solo se soporta conexión a RACK/ODF.');
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
                btn.onclick = () => this.finalizeFiberConnection(port);
            }
            grid.appendChild(btn);
        });

        this.splitterModals.fiberConnStep2.classList.add('hidden');
        this.splitterModals.fiberConnStep3.classList.remove('hidden');
    }

    finalizeFiberConnection(destPort) {
        // 1. Get selected outgoing connection
        const { nodeId, connId } = JSON.parse(this.splitterModals.fiberDestNode.value);
        const connection = this.inventoryManager.getConnections().find(c => c.id === connId);

        // 2. Find first available fiber in outgoing cable (Simple auto-assign for now)
        // In a full implementation, we should let user select the fiber
        const availableFiber = connection.fiberDetails.find(f => !f.used);

        if (!availableFiber) {
            alert('No hay hilos disponibles en el cable seleccionado.');
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
        availableFiber.used = true;
        availableFiber.fromTermination = {
            nodeId: this.currentSplitterNodeId,
            splitterId: this.currentSplitterId,
            port: splitterPort.portNumber
        };
        availableFiber.toTermination = {
            nodeId: nodeId,
            equipId: this.selectedDestEquip.id,
            portId: destPort.id
        };

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

        this.inventoryManager.save();
        this.inventoryManager.updateNode(destNode); // Save port changes

        alert(`Conectado exitosamente vía Hilo ${availableFiber.number} (${availableFiber.color})`);

        this.splitterModals.fiberConnection.classList.add('hidden');
        this.showSplitterPorts(this.currentSplitterId);
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

    renderRackList(node) {
        const container = this.rackView.list;
        container.innerHTML = '';

        if (!node.rack || node.rack.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay equipos en este RACK.</p>';
            return;
        }

        node.rack.forEach(equip => {
            const item = document.createElement('div');
            item.className = 'rack-item';

            const providerBadge = equip.isProvider ? '<span style="background:#2ecc71; color:white; padding:2px 5px; border-radius:3px; font-size:10px; margin-left:5px;">PROVEEDOR</span>' : '';

            item.innerHTML = `
                <div class="rack-item-header">
                    <strong>${equip.name}</strong> <span style="font-size: 12px; color: #666;">(${equip.type})</span>${providerBadge}
                    <span style="font-size: 12px; color: #666; margin-left: auto;">${equip.totalPorts} Puertos</span>
                </div>
                <div class="rack-actions">
                    <button class="action-btn btn-view-ports">Ver Puertos</button>
                    <button class="btn-secondary btn-edit">Editar</button>
                    <button class="btn-danger btn-delete">Eliminar</button>
                </div>
            `;
            container.appendChild(item);

            item.querySelector('.btn-view-ports').addEventListener('click', () => {
                this.showEquipmentPorts(node.id, equip.id);
            });
            item.querySelector('.btn-edit').addEventListener('click', () => {
                this.openEditEquipmentModal(node.id, equip.id);
            });
            item.querySelector('.btn-delete').addEventListener('click', () => {
                this.deleteEquipment(node.id, equip.id);
            });
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

    // Expose for debugging/testing
    window.mapManager = mapManager;
    window.inventoryManager = inventoryManager;
    window.uiManager = uiManager;
});
