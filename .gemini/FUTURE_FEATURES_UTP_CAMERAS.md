# Especificaciones para Futuras Funcionalidades - Cables UTP y Cámaras

## 1. Gestión Avanzada de Cables UTP

### 1.1 Tipos de Terminación
Cuando se crea una conexión UTP, el sistema deberá permitir especificar:

#### A. Patchcord (Cable Ponchado)
- **Características**:
  - Los 4 pares están unidos en un solo conector
  - No se pueden usar pares individuales
  - Conexión punto a punto completa
  - Estándar: T568A o T568B

#### B. Ponchado en Punta
- **Características**:
  - Permite usar pares individuales
  - Cada par puede tener un destino diferente
  - Útil para aplicaciones mixtas (video + energía)

### 1.2 Configuración de Pares UTP
Para cables ponchados en punta, el sistema permitirá:

**Estándares de Ponchado:**
- T568A
- T568B
- Por Hilos (personalizado)

**Asignación de Pares:**
```
Par 1 (Azul)      → Uso: Video / Datos / Energía / Libre
Par 2 (Naranja)   → Uso: Video / Datos / Energía / Libre
Par 3 (Verde)     → Uso: Video / Datos / Energía / Libre
Par 4 (Café)      → Uso: Video / Datos / Energía / Libre
```

### 1.3 Estructura de Datos (Futuro)
```javascript
connection: {
    cableType: "UTP CAT6",
    terminationType: "PATCHCORD" | "EN_PUNTA",
    
    // Solo si terminationType === "EN_PUNTA"
    punchdownStandard: "T568A" | "T568B" | "CUSTOM",
    pairAssignments: [
        { pair: 1, color: "Azul", usage: "VIDEO", destination: "Camera_01" },
        { pair: 2, color: "Naranja", usage: "POWER", destination: "Camera_01" },
        { pair: 3, color: "Verde", usage: "FREE", destination: null },
        { pair: 4, color: "Café", usage: "FREE", destination: null }
    ]
}
```

## 2. Nodos Tipo Cámara

### 2.1 Campos Necesarios para Cámaras
Los tipos de nodo deben soportar los siguientes campos:

#### Campos Básicos:
- ✅ **Nombre** (text) - Ya disponible
- ✅ **Dirección** (address) - Ya disponible
- ✅ **Tipo de Cámara** (select) - Necesita agregarse

#### Campos Específicos de Cámara:
```javascript
{
    name: "Tipo de Cámara",
    type: "select",
    options: [
        "Analógica CVBS",
        "Analógica HD (AHD/TVI/CVI)",
        "IP PoE",
        "IP WiFi",
        "PTZ Analógica",
        "PTZ IP"
    ]
}
```

```javascript
{
    name: "Resolución",
    type: "select",
    options: [
        "720p (1MP)",
        "1080p (2MP)",
        "1440p (4MP)",
        "4K (8MP)"
    ]
}
```

```javascript
{
    name: "Alimentación",
    type: "select",
    options: [
        "12V DC",
        "24V AC",
        "PoE (802.3af)",
        "PoE+ (802.3at)",
        "Batería"
    ]
}
```

```javascript
{
    name: "Tipo de Montaje",
    type: "select",
    options: [
        "Domo",
        "Bullet",
        "PTZ",
        "Oculta",
        "Fisheye"
    ]
}
```

### 2.2 Puertos para Cámaras
Las cámaras pueden tener diferentes configuraciones de puertos:

#### Cámara Analógica:
```javascript
ports: [
    { type: "BNC", label: "Video Out" },
    { type: "DC", label: "Power 12V" }
]
```

#### Cámara IP PoE:
```javascript
ports: [
    { type: "RJ45_POE", label: "Network + Power" }
]
```

#### Cámara Analógica con Audio:
```javascript
ports: [
    { type: "BNC", label: "Video Out" },
    { type: "RCA", label: "Audio In" },
    { type: "DC", label: "Power 12V" }
]
```

## 3. Validaciones de Conexión

### 3.1 Compatibilidad de Medios
El sistema debe validar:

```javascript
// Cámara Analógica → Requiere cable coaxial o UTP con balun
if (nodeType === "CAMARA_ANALOGICA") {
    allowedCables = ["COAXIAL", "UTP_CON_BALUN"];
}

// Cámara IP → Requiere UTP o Fibra
if (nodeType === "CAMARA_IP") {
    allowedCables = ["UTP", "FIBRA"];
}
```

### 3.2 Validación de Energía
```javascript
// Si cámara requiere PoE, validar que el switch tenga puertos PoE
if (camera.powerType === "PoE" && !switch.hasPoePort) {
    showError("El switch no tiene puertos PoE disponibles");
}
```

## 4. Implementación Sugerida

### Fase 1 (Actual): ✅ COMPLETADO
- [x] Tipos de cable configurables
- [x] Selector de PATCHCORD
- [x] Ocultar selector de hilos para UTP

### Fase 2 (Próxima):
- [ ] Agregar campo `termination_type` a tabla `cable_types`
- [ ] Agregar campo `punchdown_standard` a tabla `connections`
- [ ] Crear modal de configuración de pares UTP
- [ ] Implementar validación de compatibilidad

### Fase 3 (Futuro):
- [ ] Crear tipo de nodo "CAMARA" con campos específicos
- [ ] Agregar tipos de puerto BNC, RCA, DC
- [ ] Implementar validación de alimentación
- [ ] Crear vista de diagrama de conexiones por pares

## 5. Verificación de Campos Disponibles

### Campos Actualmente Disponibles en Node Types:
- ✅ text (texto simple)
- ✅ address (dirección)
- ✅ select (lista de opciones)
- ✅ ports (puertos de red)
- ✅ rack (equipos en rack)
- ✅ splitter (divisores ópticos)

### Campos Necesarios para Cámaras:
Todos los campos necesarios YA ESTÁN DISPONIBLES usando el tipo "select" con opciones personalizadas.

## 6. Ejemplo de Configuración de Nodo Cámara

```javascript
{
    name: "CAMARA",
    color: "#FF5722",
    fields: [
        {
            name: "Tipo de Cámara",
            type: "select",
            options: ["Analógica CVBS", "Analógica HD", "IP PoE", "PTZ IP"]
        },
        {
            name: "Resolución",
            type: "select",
            options: ["720p", "1080p", "4K"]
        },
        {
            name: "Alimentación",
            type: "select",
            options: ["12V DC", "PoE", "PoE+"]
        },
        {
            name: "Ubicación",
            type: "address"
        },
        {
            name: "Conectividad",
            type: "ports"
        }
    ],
    is_rackable: false
}
```

## Conclusión

✅ **El sistema actual YA TIENE todos los campos necesarios** para crear tipos de nodo CAMARA.

✅ **Las funcionalidades de ponchado UTP** están documentadas y listas para implementación futura.

✅ **La estructura de datos** está preparada para soportar estas funcionalidades sin cambios mayores en la base de datos.
