# PROJECT_AUDIT — Registro Contable App

Fecha de la auditoría: 2026-10-22. Origen: `pdf-annotator-vite_backup12102025.zip` (copia de seguridad del 12/10/2025). El original quedó intacto; todas las pruebas se hicieron sobre una copia aparte.

## 1. Qué es (hechos comprobados en el código)

Aplicación de escritorio Electron + React (Vite) para anotar PDF de facturas, editar renglones contables extraídos de XML (factura electrónica; CUFE tomado del nodo `UUID`), guardarlos en SQLite local y exportar el PDF anotado. Versión `0.1.0-alpha`, autor `AlexWirrell`, licencia declarada `UNLICENSED`.

Puntos de entrada: `electron/main.cjs` (proceso principal), `electron/preload.cjs` (puente `window.electronAPI`), `src/main.jsx` → `src/App.jsx` (1 701 líneas, componente monolítico).

## 2. Verificaciones realizadas

Entorno: Linux, Node 22.22.0, npm 10.9.4, red restringida por lista de permitidos.

| Verificación | Resultado |
|---|---|
| `npm ci` completo | ❌ Falla en `postinstall` (`electron-builder install-app-deps`): sin binario precompilado de `better-sqlite3` para Electron 28.3.3 en ese entorno y HTTP 403 al bajar cabeceras de Electron. Causa atribuida a la red del entorno; **no confirmado** en un equipo normal. |
| `npm ci --ignore-scripts` | ✅ 497 paquetes; versiones instaladas coinciden con el lockfile. |
| Binario de Electron | ✅ Se descargó (`node_modules/electron/dist`). |
| `npm run build:vite` / `vite build` | ✅ Genera `dist/` y `dist-electron/`. Solo advertencia de chunk > 500 kB. |
| `npm run dev` | ⚠️ Vite arranca en :5173 y compila Electron; la ventana no abre por no haber pantalla (`$DISPLAY`) y falta el módulo nativo para Electron. App no verificada. |
| Módulo `electron/database.cjs` con Node | ✅ Crear tablas, guardar y leer por CUFE (base en memoria). |
| `npm run build:win` | ⚠️ No ejecutado (requiere Windows). |
| Pruebas automatizadas | No existen. |
| ESLint | No ejecutable: `eslint.config.js` importa paquetes que no están en `package.json`. |
| `npm audit --omit=dev` | 3 vulnerabilidades: `fast-xml-parser` (crítica, hay corrección con `npm audit fix`), `tar-fs` (alta, corrección disponible), `xlsx` 0.18.5 (alta, sin corrección en npm). **No se aplicó ninguna corrección** para no alterar dependencias sin tu decisión. |

## 3. Secretos y datos sensibles

- Búsqueda de `password|secret|token|api key|clave privada` en el código propio: sin coincidencias (las únicas están dentro de `dist-electron/main.js`, código de librerías empaquetado).
- No hay `.env`, certificados, claves, ni bases `.sqlite`/`.db` en el ZIP.
- No hay uso de `process.env` ni `import.meta.env`; por eso **no se creó `.env.example`**.
- Riesgo a vigilar: las bases SQLite y los PDF/XML que uses con la app contienen datos contables reales; `.gitignore` excluye `*.sqlite`, `*.sqlite3`, `*.db`. No añadas facturas reales al repositorio.

## 4. Problemas y hallazgos

1. `eslint.config.js` sin dependencias instaladas (eslint, @eslint/js, globals, plugins de React).
2. Sin pruebas ni script `lint`/`test`.
3. Vulnerabilidades de dependencias (sección 2).
4. `postinstall` depende de poder descargar/compilar un módulo nativo; frágil en redes restringidas.
5. Puerto 5173 fijo en `electron/main.cjs`.
6. `src/App.jsx` de ~1 700 líneas; difícil de mantener (no se modificó).
7. Nombres inconsistentes (`registro-contable-app`, `RegistrApp`, `pdf-annotator-vite`).
8. `README.md` original era la plantilla de Vite sin información del proyecto (reemplazado).
9. `index.html` usa el icono `vite.svg` y existen `src/assets/react.svg` y `src/App.css` de la plantilla de Vite; no se evaluó si se usan (no se modificaron).

## 5. Cambios respecto al original

| Archivo | Cambio |
|---|---|
| `README.md` | **Reescrito** (el original era la plantilla de Vite). Incluye guía de instalación con estado de verificación. |
| `.gitignore` | **Ampliado**: añade `dist-electron`, `release`, `.env*`, `*.sqlite/*.sqlite3/*.db`, `Thumbs.db`. Conserva las reglas originales. |
| `PROJECT_AUDIT.md` | **Nuevo** (este informe). |
| `dist/` y `dist-electron/` | **No incluidos**: son artefactos generados y reproducibles con `npm run build:vite`. Siguen en el ZIP original. |
| Código fuente, `package.json`, `package-lock.json`, configuraciones, `build/icon.ico`, `public/` | Sin cambios. |

`src/` se copió completo y sin modificar.

## 6. Decisiones pendientes (requieren tu intervención)

1. **Licencia**: `package.json` dice `UNLICENSED` (todos los derechos reservados). No se creó `LICENSE`. Si el repositorio será público y quieres permitir uso, elige una (MIT, Apache-2.0, GPL-3.0, etc.); si es privado o no quieres permitir reutilización, puedes dejarlo así.
2. **Repositorio público o privado**: la app trata datos contables; recomendable privado hasta revisar.
3. **Vulnerabilidades**: decidir si actualizar `fast-xml-parser`/`tar-fs` (`npm audit fix`) y qué hacer con `xlsx`.
4. **Nombre del proyecto** (unificar).

## 7. Cómo subir a GitHub

```bash
cd registro-contable-app
git init -b main
git add .
git status          # revisa que no aparezcan node_modules, dist, *.sqlite ni archivos con datos reales
git commit -m "Versión inicial: Registro Contable App"
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

Crea antes el repositorio vacío en GitHub (sin README ni .gitignore, para evitar conflictos) y, si es privado, elige "Private".
