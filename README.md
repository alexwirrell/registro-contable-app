# Registro Contable App (RegistrApp)

Aplicación de escritorio (Electron + React) para procesar y registrar documentos contables: permite abrir PDF y XML de facturas electrónicas, anotar valores sobre el PDF, editar los renglones contables extraídos del XML, guardar los datos en una base SQLite local y exportar el PDF anotado.

<img width="1368" height="1034" alt="image" src="https://github.com/user-attachments/assets/5d24e764-c3a8-484c-a8ec-3072a566cd38" />


> **Estado: alfa (`0.1.0-alpha`).** No hay pruebas automatizadas ni licencia definida. Consulta [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) para el estado detallado.

## Leyenda de verificación

En esta guía cada paso está marcado según cómo se comprobó:

- ✅ **Verificado**: se ejecutó en una copia limpia del proyecto (Linux, Node 22.22.0, npm 10.9.4) y funcionó.
- 🔎 **Deducido**: se infiere del código o de los manifiestos, pero no se pudo ejecutar.
- ⚠️ **No verificado / limitación**: se intentó y falló por limitaciones del entorno de prueba, o no pudo intentarse.

## Funcionalidades (según el código)

- Abrir uno o varios archivos `.pdf` / `.xml` (diálogo nativo).
- Interpretar el XML de la factura (extrae el CUFE desde el nodo `UUID` y genera filas de detalle).
- Colocar anotaciones (etiqueta + valor) sobre el PDF y guardarlo como un PDF nuevo (`pdf-lib`).
- Tabla editable de renglones contables (`@tanstack/react-table`).
- Cargar catálogos desde `.xlsx`, `.xls` o `.csv` y consultarlos con la tecla **F2** en las columnas *Cuenta contable*, *Centro de costos* y *Concepto de retención*.
- Guardar/cargar plantillas de posiciones en JSON.
- Crear, abrir y copiar bases de datos SQLite (`better-sqlite3`); los datos se guardan por CUFE.

Las funcionalidades anteriores se describen a partir del código fuente; **no se ejecutó la interfaz gráfica** en la revisión (ver [Limitaciones](#limitaciones-conocidas)).

## Tecnologías

| Área | Tecnología (versión según `package.json` / `package-lock.json`) |
|---|---|
| Interfaz | React 18.3.1, Tailwind CSS 3.4.17, lucide-react, react-resizable-panels |
| Empaquetado/desarrollo | Vite 5.4.19, `vite-plugin-electron` 0.28.8 |
| Escritorio | Electron 28.3.3, electron-builder 24.13.3 (solo objetivo Windows x64 / NSIS) |
| Base de datos | SQLite mediante `better-sqlite3` 12.2.0 (módulo nativo) |
| Documentos | `pdfjs-dist` 5.3.93, `pdf-lib` 1.17.1, `fast-xml-parser` 5.2.5, `xlsx` 0.18.5 |

---

# Guía de instalación y puesta en marcha

## 1. Requisitos previos

| Herramienta | Versión | Estado |
|---|---|---|
| **Node.js** | **20.x o 22.x** recomendado (probado con **22.22.0**) | ✅ 22.22.0 verificado. `better-sqlite3` 12.2.0 declara `node: 20.x \|\| 22.x \|\| 23.x \|\| 24.x` y Vite 5.4.19 declara `^18 \|\| >=20`; por eso se recomienda 20 o 22. |
| **npm** | 10.x (probado con **10.9.4**, incluido con Node 22) | ✅ El proyecto usa `package-lock.json` (lockfileVersion 3), por lo que **el gestor correcto es npm**. No hay `yarn.lock` ni `pnpm-lock.yaml`. |
| **Git** | Cualquier versión reciente | Solo para clonar. |
| **Conexión a Internet** | — | Necesaria durante `npm install`: se descargan el binario de Electron y binarios precompilados de `better-sqlite3`. |
| **Sistema operativo** | **Windows 10/11 x64** es el único destino de empaquetado configurado | 🔎 El desarrollo en Linux/macOS parece posible (Electron y Vite son multiplataforma), pero solo se probó la instalación y el build web en Linux. |
| **Compilador C++ + Python** (solo como respaldo) | Windows: *Visual Studio Build Tools* con "Desktop development with C++" y Python 3 | 🔎 Solo se necesita si no existe un binario precompilado de `better-sqlite3` para tu versión de Electron y `node-gyp` debe compilarlo. |

El proyecto **no define** el campo `engines` en `package.json`; las versiones anteriores salen de las dependencias, no de una exigencia explícita del proyecto.

## 2. Clonar el repositorio

Ejecuta en una terminal (PowerShell, CMD o Git Bash). Sustituye `<URL-DEL-REPOSITORIO>` por la URL de tu repositorio en GitHub:

```bash
git clone https://github.com/alexwirrell/registro-contable-app
cd registro-contable-app
```

(Si descargaste un ZIP, descomprímelo y entra a la carpeta que contiene `package.json`.)

## 3. Instalar dependencias

Desde la carpeta raíz del proyecto (donde está `package.json`):

```bash
npm ci
```

`npm ci` instala exactamente lo que fija `package-lock.json` (recomendado para una copia limpia). Si prefieres `npm install`, también es válido.

**Qué ocurre durante la instalación:** el script `postinstall` ejecuta `electron-builder install-app-deps`, que descarga/compila `better-sqlite3` para la versión de Electron del proyecto (28.3.3). Es el paso más delicado; si falla consulta [Errores frecuentes](#9-errores-frecuentes).

**Estado de verificación:**

- ✅ `npm ci --ignore-scripts` termina correctamente (497 paquetes).
- ⚠️ `npm ci` completo **falló en el entorno de prueba** en el `postinstall`: no existía binario precompilado de `better-sqlite3` para Electron 28.3.3 en ese entorno y la descarga de las cabeceras de Electron para compilar (`electronjs.org/headers`) devolvió HTTP 403 por restricciones de red del entorno. **No se pudo comprobar si en un equipo con acceso normal a Internet funciona sin pasos adicionales.**
- ✅ El binario de `better-sqlite3` para Node (no para Electron) sí se obtuvo con `prebuild-install`, y el módulo de base de datos funcionó en pruebas con Node (ver sección 8).

## 4. Variables de entorno y archivos de configuración

- ✅ **El proyecto no usa variables de entorno**: no hay llamadas a `process.env`, `import.meta.env` ni archivos `.env` en el código. Por eso **no se incluye `.env.example`**. (El `.gitignore` excluye `.env*` de forma preventiva.)
- No hay claves de API, tokens ni credenciales en el código.
- Archivos de configuración existentes (no requieren edición para ejecutar):

| Archivo | Función |
|---|---|
| `package.json` | Scripts, dependencias y configuración de `electron-builder` (`build`). |
| `vite.config.mjs` | Vite + React + `vite-plugin-electron` (proceso principal `electron/main.cjs`, precarga `electron/preload.cjs`). |
| `tailwind.config.js`, `postcss.config.js` | Tailwind CSS. |
| `eslint.config.js` | Configuración de ESLint (ver nota en [Pruebas](#8-pruebas-y-comprobaciones)). |
| `build/icon.ico` | Icono del instalador de Windows. |

- 🔎 El puerto de desarrollo **5173** está escrito en `electron/main.cjs` (`http://localhost:5173`). Debe estar libre.

## 5. Base de datos

- La base es un **archivo SQLite local** que **crea la propia aplicación**. No hay que instalar ningún servidor de base de datos ni crear nada previamente.
- ✅/🔎 Al elegir *Nueva base de datos* en la aplicación, se crea el archivo (extensión `.sqlite` o `.db`, ubicación a tu elección) y el código ejecuta `CREATE TABLE IF NOT EXISTS` para las tablas `documentos` y `detalles_documento` y un índice único (`electron/database.cjs`). ✅ Esta lógica se probó con Node sobre una base en memoria: guardar y leer un documento por CUFE funcionó.
- **No hay migraciones ni scripts de semillas.** Si más adelante cambia el esquema, las bases creadas con versiones anteriores no se actualizarán automáticamente (`CREATE TABLE IF NOT EXISTS` no altera tablas existentes).
- Los archivos `.sqlite`/`.db` contienen datos contables: están excluidos en `.gitignore`. **No los subas a GitHub.**

## 6. Migraciones, generación de archivos y servicios auxiliares

- No hay migraciones, generadores de código ni servicios auxiliares (Docker, Redis, etc.).
- Los directorios `dist/`, `dist-electron/` y `release/` son **generados** por el build y no se versionan.

## 7. Ejecutar la aplicación

### Desarrollo

Desde la raíz del proyecto:

```bash
npm run dev
```

🔎 Esto inicia Vite en `http://localhost:5173` y, mediante `vite-plugin-electron`, compila los procesos de Electron y abre la ventana de la aplicación con DevTools (`electron/main.cjs` abre DevTools cuando `app.isPackaged` es falso).

Estado de verificación:

- ✅ Vite arranca (`VITE v5.4.19 ready`, `http://localhost:5173/`) y compila `dist-electron/main.js` y `dist-electron/preload.js`.
- ⚠️ La ventana de Electron **no pudo abrirse** en el entorno de prueba (sin pantalla: `Missing X server or $DISPLAY`) y, además, no existía el módulo nativo para Electron. **No se verificó que la aplicación arranque ni que la interfaz funcione.**

### Compilar la interfaz web (verificado)

```bash
npm run build:vite
```

✅ Genera `dist/` (HTML, CSS, JS y `pdf.worker`) y también `dist-electron/`. Avisa de un chunk mayor de 500 kB; es solo una advertencia.

### Construir el instalador para Windows

Ejecuta en **Windows x64**, desde la raíz:

```bash
npm run build:win
```

🔎 Ejecuta `build:vite` y luego `electron-builder --win --x64`; según `package.json` produce un instalador NSIS (no "un clic", permite elegir carpeta) en la carpeta `release/`. ⚠️ **No se ejecutó**, así que no se garantiza que termine correctamente. No hay scripts para macOS ni Linux.

## 8. Pruebas y comprobaciones

- **No existen pruebas automatizadas**: no hay script `test`, ni archivos `*.test.*`/`*.spec.*`, ni framework de pruebas instalado. No se inventó ningún comando de prueba.
- **No hay script de lint.** `eslint.config.js` importa `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` y `eslint/config`, pero **ninguno está en `package.json`** (ni `eslint`). Para usarlo habría que añadir esos paquetes como dependencias de desarrollo.

Comprobaciones manuales recomendadas para validar una instalación:

1. ✅ `npm run build:vite` termina con `✓ built in ...` y existe `dist/index.html`.
2. 🔎 `npm run dev` abre la ventana de la aplicación.
3. 🔎 En la aplicación: *Nueva base de datos* → crear un `.sqlite`; abrir un PDF y un XML de factura electrónica; guardar datos; guardar el PDF anotado.

Prueba de humo del módulo de base de datos con Node (✅ ejecutada con éxito en el entorno de prueba; requiere que `better-sqlite3` esté compilado para Node, no para Electron):

```bash
node -e "const d=require('./electron/database.cjs');const db=d.connectDatabase(':memory:');console.log(d.saveDataForCufe(db,{cufe:'C1',metadata:{nombreArchivoFinal:'a',consecutivo:'1',comentarios:'',positions:{},retencionesDinamicas:[]},details:[]}))"
```

Resultado esperado: `Base de datos conectada en: :memory:` y `{ success: true }`.

## 9. Errores frecuentes

| Síntoma | Causa | Solución | Fiabilidad |
|---|---|---|---|
| `npm ci` falla en `postinstall` con `No prebuilt binaries found (target=28.3.3 runtime=electron ...)` seguido de `403` al descargar `electronjs.org/headers/...` | `better-sqlite3` no se pudo descargar precompilado y `node-gyp` no consiguió las cabeceras de Electron (red restringida, proxy o firewall). | Instalar con acceso a Internet sin restricciones hacia `github.com` y `electronjs.org`; en Windows instalar *Visual Studio Build Tools* (C++) y Python 3 para permitir la compilación local; reintentar `npm ci`. | ✅ Error reproducido; la causa de red es lo observado, la solución general se **deduce**. |
| `npm ci --ignore-scripts` instala pero la app no abre / `Cannot find module ... better_sqlite3.node` | Con `--ignore-scripts` no se ejecuta `postinstall` y falta el módulo nativo para Electron. | Ejecutar `npx electron-builder install-app-deps` en la raíz del proyecto. | 🔎 Deducido. |
| `NODE_MODULE_VERSION xx ... requires NODE_MODULE_VERSION yy` | `better-sqlite3` compilado para Node cuando lo carga Electron (o al revés). | Para la app: `npx electron-builder install-app-deps`. Para probar con Node plano: `npm rebuild better-sqlite3` (esto lo deja para Node y hay que repetir `install-app-deps` antes de `npm run dev`). | 🔎 Deducido; es comportamiento estándar de módulos nativos. |
| La ventana de Electron queda en blanco o con error de conexión en desarrollo | Otro proceso usa el puerto 5173 y Vite eligió otro, mientras `electron/main.cjs` busca fijo `http://localhost:5173`. | Liberar el puerto 5173 y reiniciar `npm run dev`. | 🔎 Deducido del código. |
| `Missing X server or $DISPLAY` | Se ejecutó Electron en Linux sin entorno gráfico. | Ejecutar en un equipo con escritorio (o con `xvfb-run`). | ✅ Reproducido. |
| `npm run build:win` falla fuera de Windows | Solo hay configuración para Windows/NSIS. | Ejecutar en Windows. | 🔎 Deducido; no probado. |

## Estructura del proyecto

```
.
├── electron/
│   ├── main.cjs          # Proceso principal de Electron: ventana, diálogos, IPC, guardado de PDF
│   ├── preload.cjs       # API segura expuesta al renderizador (window.electronAPI)
│   └── database.cjs      # Acceso a SQLite (better-sqlite3): tablas y consultas
├── src/
│   ├── main.jsx          # Punto de entrada de React
│   ├── App.jsx           # Componente principal (visor PDF, anotaciones, XML, plantillas, BD)
│   ├── components/       # DataPanel, XmlPanel, Annotation, LookupModal, CurrencyInput, Toast
│   └── hooks/            # useResizeObserver
├── public/               # Recursos estáticos
├── build/icon.ico        # Icono del instalador
├── index.html            # HTML de entrada de Vite
├── vite.config.mjs       # Configuración de Vite + Electron
├── tailwind.config.js / postcss.config.js / eslint.config.js
└── package.json / package-lock.json
```

## Limitaciones conocidas

- Alfa: no se ha verificado el funcionamiento de la interfaz de extremo a extremo.
- Sin pruebas automatizadas ni script de lint funcional.
- Sin licencia definida (`package.json` indica `UNLICENSED`). No se ha añadido archivo `LICENSE`; la decisión es del autor.
- `npm audit --omit=dev` (ejecutado en el entorno de prueba) reportó vulnerabilidades en `fast-xml-parser` (crítica, con corrección disponible vía `npm audit fix`), `tar-fs` (alta) y `xlsx` 0.18.5 (alta, sin corrección en el registro npm). Úsese solo con archivos de confianza hasta evaluarlas.
- Nombres inconsistentes: el paquete se llama `registro-contable-app`, la ventana HTML `RegistrApp`, y el respaldo original `pdf-annotator-vite`.
- Los PDF se formatean en pesos colombianos (`es-CO`, COP) y la lógica XML parece orientada a factura electrónica colombiana (nodo `UUID`/CUFE); no se probó con otros formatos.

## Próximos pasos sugeridos

1. Verificar `npm ci` y `npm run dev` en un equipo Windows con acceso normal a Internet.
2. Decidir una licencia y añadir `LICENSE`.
3. Añadir pruebas (p. ej. para `electron/database.cjs` y el extractor de XML) y completar las dependencias de ESLint.
4. Revisar las vulnerabilidades reportadas por `npm audit`.

## Licencia

Pendiente de definir por el autor.
