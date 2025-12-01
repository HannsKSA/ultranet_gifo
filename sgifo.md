# Especificación de Requerimientos de Software: SGIFO

## 1. Introducción
Este documento especifica los requerimientos para el **Sistema de Gestión de Infraestructura de Fibra Óptica (SGIFO)**. El sistema permitirá a los usuarios controlar visualmente el desarrollo de su red de fibra óptica, gestionar los componentes físicos y lógicos, y analizar la topología de la red.

## 2. Stack Tecnológico
*   **Lenguaje Principal**: Python (Considerando compatibilidad/sincronización futura con Odoo 16.0 Community Edition).
*   **Base de Datos**: Supabase (PostgreSQL).
*   **Frontend**: HTML, CSS, JavaScript (Diseño responsivo y dinámico).
*   **Mapas**: Integración con servicios de mapas gratuitos (ej. OpenStreetMap, Leaflet).

## 3. Glosario y Definiciones
*   **Infraestructura**: Conjunto de elementos físicos y lógicos del inventario.
*   **OLT**: Equipo activo central.
*   **NAP/CTO**: Caja de distribución final.
*   **Drop**: Cable final al cliente.
*   **Rack**: Bastidor donde se agrupan equipos.

## 4. Requerimientos Funcionales

### RF1: Gestión de Inventario de Infraestructura
**Historia de Usuario**: Registrar y gestionar todos los equipos (OLT, ODF, CEO, CTO) para mantener un inventario actualizado.

### RF2: Visualización Geoespacial
**Historia de Usuario**: Visualizar equipos sobre un mapa interactivo.

### RF3: Gestión de Topología y Conexiones
**Historia de Usuario**: Definir cómo se conectan los equipos entre sí (ej. OLT -> ODF -> CEO -> CTO).

### RF4: Gestión de Fallas y Análisis de Impacto
**Historia de Usuario**: Reportar daños y ver automáticamente qué equipos y clientes se ven afectados (aguas abajo).

### RF5: Diagnóstico Inverso de Atenuación
**Historia de Usuario**: Identificar el punto de falla común a partir de múltiples reportes de clientes.

### RF6: Gestión de Disponibilidad de Puertos
**Historia de Usuario**: Visualizar disponibilidad de puertos en Cajas NAP para ventas.

### RF7: Trazabilidad de Hilos
**Historia de Usuario**: Registrar fusión hilo a hilo.

### RF8: Gestión de Propiedades de Cableado
**Historia de Usuario**: Como técnico, al conectar dos nodos, quiero especificar qué tipo de cable estoy usando (ej. ADSS, Drop, Subterráneo) y cuántos hilos tiene (ej. 6, 12, 24, 48) para llevar un control exacto de la capacidad instalada.
**Criterios de Aceptación**:
1.  Al crear una conexión, el sistema debe solicitar: Tipo de Cable y Cantidad de Hilos.
2.  Visualización en el mapa: Diferentes estilos o etiquetas según el tipo/capacidad.

### RF9: Gestión de Clientes y ONUs
**Historia de Usuario**: Como gestor de red, quiero registrar las ONUs (equipos de cliente) como nodos en el mapa para saber exactamente dónde termina la red y a qué caja NAP están conectados.
**Criterios de Aceptación**:
1.  Nuevo tipo de nodo: "ONU / Cliente".
2.  Debe permitir registrar datos del cliente (Nombre, Dirección, Plan).
3.  Debe poder conectarse a una NAP (CTO).

### RF10: Gestión Jerárquica de Racks y Patching
**Historia de Usuario**: Como administrador de nodo, quiero crear un "Rack" en el mapa y dentro de él agregar múltiples equipos (OLT, ODF, Router), definir sus puertos y realizar conexiones internas (patching) entre ellos (ej. Puerto 1 OLT -> Puerto 3 ODF).
**Criterios de Aceptación**:
1.  **Nodo Tipo Rack**: Capacidad de agregar un nodo contenedor tipo "Rack" o "Gabinete".
2.  **Gestión de Equipos Internos**: Dentro del Rack, agregar equipos independientes (Router, OLT, ODF, Switch).
3.  **Gestión de Puertos**: Para cada equipo, definir cantidad y tipo de puertos.
4.  **Patching Interno**: Interfaz para conectar un puerto de un equipo A con un puerto de un equipo B dentro del mismo Rack.
5.  **Visualización**: Ver la lista de equipos y sus interconexiones.