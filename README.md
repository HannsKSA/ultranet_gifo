# SGIFO - Sistema de Gestión de Infraestructura de Fibra Óptica

## Configuración Inicial

Para ejecutar el sistema, es necesario configurar las variables de entorno.

### Paso 1: Crear archivo .env

Copia el archivo de plantilla proporcionado:

```bash
cp .env.template .env
```

### Paso 2: Editar credenciales

Abre el archivo `.env` y rellena los valores necesarios. 

**IMPORTANTE**: Es **obligatorio** definir las credenciales del Super Administrador para inicializar la base de datos correctamente.

```env
# Ejemplo
USER_SUPERADMIN_EMAIL=mi_email@ejemplo.com
USER_SUPERADMIN_PASSWORD=MiContraseñaSegura123
```

### Paso 3: Inicializar Base de Datos

Ejecuta el script de inicio:

```bash
python3 start --init-only
```

Si no has configurado las credenciales del Super Admin, el script fallará con un mensaje de error.

### Paso 4: Ejecutar Servidor

```bash
python3 start
```