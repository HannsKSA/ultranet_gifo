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
6.  **Edición y Eliminación**: Permitir editar o eliminar equipos dentro del rack.

### RF11: Gestión de Conexiones (Cables)
**Historia de Usuario**: Como técnico, quiero poder visualizar, editar y eliminar las conexiones de cable entre nodos para mantener actualizada la topología de la red.
**Criterios de Aceptación**:
1.  **Visualización de Detalles**: Al hacer clic en un cable, mostrar información completa (origen, destino, tipo, hilos, distancia).
2.  **Edición de Conexiones**: Permitir modificar el tipo de cable y cantidad de hilos de una conexión existente.
3.  **Eliminación de Conexiones**: Permitir eliminar conexiones con confirmación.
4.  **Indicadores Visuales**: Mostrar triángulo de advertencia (⚠️) en nodos sin conexión activa.
5.  **Actualización Automática**: Al eliminar una conexión, actualizar automáticamente los indicadores de todos los nodos afectados.

### RF12: Trazabilidad de Señal en Racks
**Historia de Usuario**: Como administrador de red, al conectar un nodo RACK con otro nodo, quiero especificar qué equipo y puerto específico del rack se está conectando para mantener la trazabilidad completa de la señal.
**Criterios de Aceptación**:
1.  **Selección de Puerto en Conexión Externa**: Al conectar desde/hacia un RACK, solicitar selección de equipo y puerto específico.
2.  **Asistente de Selección**: Interfaz paso a paso para seleccionar equipo y luego puerto.
3.  **Almacenamiento de Ruta**: Guardar información de puerto origen y destino en cada conexión.
4.  **Validación**: No permitir conectar dos RACKs directamente sin especificar equipos.
5.  **Guía de Flujo**: Indicar claramente si se selecciona puerto de SALIDA o ENTRADA de señal.

### RF13: Sistema de Reportes de Fallas en Puertos
**Historia de Usuario**: Como técnico de mantenimiento, quiero reportar fallas en conexiones de puertos dentro de un rack y ver automáticamente qué nodos downstream se ven afectados, para priorizar reparaciones.
**Criterios de Aceptación**:
1.  **Reportar Falla**: Botón para marcar una conexión de puerto como "reportada".
2.  **Indicadores Visuales en Puertos**: 
    - Puerto reportado: color rojo con icono ⚠️
    - Puerto normal: color verde
3.  **Propagación Downstream**: Al reportar un puerto, mostrar triángulo ⚠️ en todos los nodos afectados aguas abajo.
4.  **Resolver Reporte**: Botón para marcar la falla como resuelta.
5.  **Actualización Automática**: Al resolver, quitar automáticamente los indicadores de advertencia.
6.  **Limpieza en Desconexión**: Al desconectar un puerto reportado, limpiar automáticamente el estado de reporte.
7.  **Análisis de Impacto**: Identificar todas las conexiones externas que usan el puerto reportado y marcar nodos afectados.

### RF14: Gestión de Hilos Individuales y Splitters
**Historia de Usuario**: Como técnico de fibra óptica, quiero gestionar cada hilo individual dentro de un cable troncal y poder agregar splitters en muflas para dividir la señal, manteniendo trazabilidad completa hilo por hilo.

**Criterios de Aceptación**:
1.  **Gestión de Hilos en Cables**:
    - Cada cable debe permitir especificar cantidad de hilos (6, 12, 24, 48, 96)
    - Cada hilo debe tener identificación por número y color estándar
    - Poder ver y gestionar cada hilo individualmente

2.  **Splitters en Muflas**:
    - Agregar splitters de tipo 1x8 o 1x16 a una mufla
    - Asignar un hilo de entrada específico al splitter (ej: hilo azul #1)
    - Gestionar puertos de salida del splitter
    - Conectar cada puerto de salida a destinos específicos

3.  **Trazabilidad Hilo a Hilo**:
    - Desde cable troncal → hilo específico → splitter en mufla → puerto de salida → puerto en rack
    - Ejemplo: ADSS 12h → Hilo Azul (#1) → Splitter 1x8 → Puerto 3 → Rack/ODF/P5
    - Visualizar ruta completa de cada hilo

4.  **Terminaciones**:
    - Especificar terminación de origen (mufla/splitter/puerto)
    - Especificar terminación de destino (rack/equipo/puerto)
    - Validar que no se use el mismo hilo dos veces

5.  **Interfaz de Usuario**:
    - Vista de gestión de hilos al hacer clic en cable troncal
    - Vista de splitters en detalles de mufla
    - Indicadores visuales de hilos usados/disponibles
    - Código de colores para identificación rápida

6.  **Validaciones**:
    - No permitir conectar más hilos que los disponibles en el cable
    - No permitir usar un hilo ya asignado
    - Validar capacidad del splitter (1x8 o 1x16)
    - Verificar disponibilidad de puertos en destino

## 5. Estado de Implementación

### ✅ Implementado
- RF1: Gestión de Inventario de Infraestructura
- RF2: Visualización Geoespacial
- RF3: Gestión de Topología y Conexiones
- RF4: Gestión de Fallas y Análisis de Impacto
- RF8: Gestión de Propiedades de Cableado
- RF9: Gestión de Clientes y ONUs
- RF10: Gestión Jerárquica de Racks y Patching
- RF11: Gestión de Conexiones (Cables)
- RF12: Trazabilidad de Señal en Racks
- RF13: Sistema de Reportes de Fallas en Puertos

### 🔄 Pendiente
- RF5: Diagnóstico Inverso de Atenuación
- RF6: Gestión de Disponibilidad de Puertos

### 🚧 En Desarrollo
- RF7: Trazabilidad de Hilos (fusión hilo a hilo) - Evoluciona a RF14
- RF14: Gestión de Hilos Individuales y Splitters

## 6. Características Técnicas Implementadas

### Almacenamiento
- LocalStorage para persistencia de datos
- Estructura de datos JSON para nodos, conexiones y equipos

### Interfaz de Usuario
- Sistema de modales para formularios
- Asistentes paso a paso (wizards) para procesos complejos
- Indicadores visuales de estado (colores, iconos)
- Vistas contextuales según tipo de elemento

### Gestión de Estado
- Detección automática de nodos sin conexión
- Propagación de estados de falla
- Actualización reactiva de indicadores visuales