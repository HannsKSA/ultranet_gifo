# Guía Rápida: Crear Tipo de Nodo CAMARA

## Pasos para Crear el Tipo de Nodo

### 1. Acceder al Panel Admin
1. Abrir la aplicación en http://localhost:8000
2. Iniciar sesión
3. Click en el botón **"⚙️ Panel Admin"** (se pone azul al pasar el mouse)

### 2. Ir a Tipos de Nodo
1. En el Panel Admin, click en la pestaña **"Tipos de Nodo"**
2. Click en el botón **"+ Nuevo Tipo"** (verde)

### 3. Configurar el Tipo Base
```
Nombre del Tipo: CAMARA
Color de Icono: #FF5722 (naranja/rojo)
☐ Es Rackeable: NO marcar (las cámaras no van en racks)
```

### 4. Agregar Campos Dinámicos

#### Campo 1: Tipo de Cámara
- Click en **"+ Agregar Campo"**
- Nombre: `Tipo de Cámara`
- Tipo: `select`
- Opciones (separadas por coma):
  ```
  Analógica CVBS, Analógica HD (AHD), IP PoE, IP WiFi, PTZ Analógica, PTZ IP
  ```

#### Campo 2: Resolución
- Click en **"+ Agregar Campo"**
- Nombre: `Resolución`
- Tipo: `select`
- Opciones:
  ```
  720p (1MP), 1080p (2MP), 1440p (4MP), 4K (8MP)
  ```

#### Campo 3: Alimentación
- Click en **"+ Agregar Campo"**
- Nombre: `Alimentación`
- Tipo: `select`
- Opciones:
  ```
  12V DC, 24V AC, PoE (802.3af), PoE+ (802.3at)
  ```

#### Campo 4: Tipo de Montaje
- Click en **"+ Agregar Campo"**
- Nombre: `Tipo de Montaje`
- Tipo: `select`
- Opciones:
  ```
  Domo, Bullet, PTZ, Oculta, Fisheye
  ```

#### Campo 5: Ubicación
- Click en **"+ Agregar Campo"**
- Nombre: `Ubicación`
- Tipo: `address`
- (No requiere opciones)

#### Campo 6 (Opcional): Puertos
- Click en **"+ Agregar Campo"**
- Nombre: `Conectividad`
- Tipo: `ports`
- (Solo para cámaras IP que necesiten gestión de puertos)

### 5. Guardar
- Click en **"Guardar Tipo"**
- El nuevo tipo CAMARA aparecerá en la lista

## Uso del Tipo CAMARA

### Crear un Nodo Cámara
1. Click en **"📍 Agregar Nodo"**
2. Seleccionar tipo: **CAMARA**
3. Click en el mapa para ubicar la cámara
4. Completar el formulario:
   - Nombre: Ej. "CAM-001"
   - Tipo de Cámara: Seleccionar del dropdown
   - Resolución: Seleccionar del dropdown
   - Alimentación: Seleccionar del dropdown
   - Tipo de Montaje: Seleccionar del dropdown
   - Ubicación: Ingresar dirección
5. Click en **"Guardar"**

### Conectar una Cámara

#### Cámara IP PoE:
1. Seleccionar la cámara en el mapa
2. Click en **"🔗 Conectar"**
3. Click en el switch/router destino
4. Configurar conexión:
   - Tipo de Cable: **UTP CAT6** (se ocultará el selector de hilos)
   - Tipo de Tramo: **PATCHCORD**
   - (No aparece selector de hilos - automáticamente 4 pares)
5. Seleccionar puerto PoE en el switch
6. Guardar

#### Cámara Analógica:
1. Seleccionar la cámara
2. Click en **"🔗 Conectar"**
3. Click en el DVR/grabador
4. Configurar conexión:
   - Tipo de Cable: **UTP CAT6** o cable coaxial
   - Tipo de Tramo: **PATCHCORD** o **TRAMO**
5. Guardar

## Ejemplos de Configuraciones Comunes

### Ejemplo 1: Cámara IP Domo Interior
```
Nombre: CAM-RECEPCION-01
Tipo: CAMARA
Tipo de Cámara: IP PoE
Resolución: 1080p (2MP)
Alimentación: PoE (802.3af)
Tipo de Montaje: Domo
Ubicación: Recepción Principal, Piso 1
```

### Ejemplo 2: Cámara PTZ Exterior
```
Nombre: CAM-PARKING-PTZ
Tipo: CAMARA
Tipo de Cámara: PTZ IP
Resolución: 4K (8MP)
Alimentación: PoE+ (802.3at)
Tipo de Montaje: PTZ
Ubicación: Estacionamiento Norte
```

### Ejemplo 3: Cámara Analógica
```
Nombre: CAM-BODEGA-02
Tipo: CAMARA
Tipo de Cámara: Analógica HD (AHD)
Resolución: 1080p (2MP)
Alimentación: 12V DC
Tipo de Montaje: Bullet
Ubicación: Bodega Principal
```

## Notas Importantes

✅ **El selector de hilos se oculta automáticamente** cuando usas cable UTP
✅ **PATCHCORD ya está disponible** en el tipo de tramo
✅ **Todos los campos necesarios están disponibles** en el sistema actual
✅ **No se requieren cambios en la base de datos** para crear nodos tipo CAMARA

## Ventajas de Esta Configuración

1. **Flexibilidad**: Puedes crear diferentes tipos de cámaras con las mismas herramientas
2. **Organización**: Cada cámara tiene sus especificaciones técnicas documentadas
3. **Trazabilidad**: Puedes ver qué tipo de alimentación y resolución tiene cada cámara
4. **Planificación**: Facilita calcular consumo PoE y ancho de banda necesario

## Próximos Pasos (Futuro)

Las siguientes funcionalidades están documentadas para implementación futura:
- Ponchado UTP por pares individuales
- Validación automática de compatibilidad PoE
- Cálculo de consumo energético
- Asignación de pares para video + energía en cables UTP
