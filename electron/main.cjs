// electron/main.cjs

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const dbManager = require("./database.cjs");
const xlsx = require("xlsx");

// --- NUEVO: Variable para mantener la conexión a la base de datos activa.
let activeDbConnection = null;

// Condición para saber si estamos en desarrollo o producción
const isDev = !app.isPackaged;

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("dialog:openFile", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ["openFile", "multiSelections"],
    // ¡ACTUALIZADO! Añadimos XML a la lista.
    filters: [
      { name: "Documentos Soportados", extensions: ["pdf", "xml"] },
      { name: "PDFs", extensions: ["pdf"] },
      { name: "XMLs", extensions: ["xml"] },
      { name: "Todos los archivos", extensions: ["*"] },
    ],
  });

  if (canceled) {
    window.focus();
    return null;
  }

  if (filePaths.length > 0) {
    // La lógica de lectura de archivos no cambia, simplemente devuelve los datos.
    return filePaths.map((filePath) => ({
      path: filePath,
      data: fs.readFileSync(filePath),
    }));
  }

  return null;
});

// Manejador para guardar el PDF.
ipcMain.handle(
  "pdf:save",
  async (event, { originalPath, annotations, defaultPath }) => {
    try {
      const originalPdfBytes = fs.readFileSync(originalPath);
      const pdfDoc = await PDFDocument.load(originalPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      // Iteramos sobre cada anotación para dibujarla
      annotations.forEach((anno) => {
        // 1. Nos aseguramos de que la anotación tenga una página válida.
        const pageIndex = anno.position.page - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) {
          console.warn(
            `Página inválida (${anno.position.page}) para la anotación "${anno.label}". Se omitirá.`
          );
          return; // Omitimos esta anotación si la página no existe
        }

        // 2. Seleccionamos la página correcta
        const page = pages[pageIndex];
        const { width, height } = page.getSize();

        // Verificamos si el valor es un número antes de intentar formatearlo.
        // ¡LÓGICA DE FORMATEO REFORZADA!
        let displayValue = anno.value;

        // Comprobamos explícitamente que es un número y no es NaN
        const num = Number(anno.value);

        const isCurrency =
          anno.id !== "consecutivo" && anno.id !== "comentarios";

        if (isCurrency && !isNaN(num)) {
          displayValue = currencyFormatter.format(num);
        }

        const text = `${anno.label}: ${displayValue}`;
        const fontSize = 10;
        const padding = 4;

        // 3. Calculamos las dimensiones del texto para dibujar el recuadro
        const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);
        const textHeight = helveticaFont.heightAtSize(fontSize);

        // 4. Calculamos las coordenadas en el sistema de PDF (Y desde abajo)
        const rectX = (anno.position.x / 100) * width;
        const rectY =
          height - (anno.position.y / 100) * height - textHeight - padding;

        // 5. Dibujamos el RECTÁNGULO (el fondo amarillo y el borde)
        page.drawRectangle({
          x: rectX - padding,
          y: rectY,
          width: textWidth + padding * 2,
          height: textHeight + padding,
          color: rgb(1, 1, 0),
          opacity: 0.7,
          borderWidth: 1,
          borderColor: rgb(0, 0, 0),
          borderRadius: 4, // Para las esquinas redondeadas
          borderDashArray: [3, 3], // Para el borde punteado (3pt dibujado, 3pt de espacio)
        });

        // 6. Dibujamos el TEXTO encima del rectángulo
        page.drawText(text, {
          x: rectX,
          y: rectY + padding / 2,
          font: helveticaFont,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Guardar PDF Modificado",
        defaultPath: defaultPath,
        filters: [{ name: "PDFs", extensions: ["pdf"] }],
      });
      if (!canceled && filePath) {
        fs.writeFileSync(filePath, pdfBytes);
        return { success: true, path: filePath };
      }
      return { success: false, reason: "cancelled" };
    } catch (error) {
      console.error("Error al guardar el PDF:", error);
      return { success: false, reason: error.message };
    }
  }
);

ipcMain.handle("template:save", async (event, templateData) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: "Guardar Plantilla",
    defaultPath: "mi_plantilla.json",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });

  if (!canceled && filePath) {
    fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2));
    return { success: true, path: filePath };
  }
  window.focus();
  return { success: false, reason: "cancelled" };
});

ipcMain.handle("template:load", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender); // Obtenemos la ventana
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    // Pasamos la ventana
    title: "Cargar Plantilla",
    properties: ["openFile"],
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });

  if (!canceled && filePaths.length > 0) {
    const data = fs.readFileSync(filePaths[0], "utf-8");
    window.focus();
    return { success: true, data: JSON.parse(data) };
  }
  return { success: false, reason: "cancelled" };
});


ipcMain.handle("catalog:load", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Seleccionar archivo de catálogo",
      properties: ["openFile"],
      filters: [
        { name: "Hojas de cálculo", extensions: ["xlsx", "xls", "csv"] },
      ],
    });
    
    if (canceled || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
    }
    
    const filePath = filePaths[0];
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Leemos solo la primera hoja
    const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    return { success: true, data: jsonData };
  } catch (error) {
    console.error("Error al cargar el archivo de catálogo:", error);
    return { success: false, error: error.message };
  }
});

// --- MANEJADORES DE BASE DE DATOS ACTUALIZADOS Y NUEVOS ---

// --- NUEVO: Manejador para crear una nueva base de datos.
ipcMain.handle("db:new", async () => {
  const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Crear Nueva Base de Datos",
      defaultPath: "nuevo_proyecto.sqlite",
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
  });

  if (canceled || !filePath) {
      return { success: false, reason: "cancelled" };
  }

  // Si ya hay una conexión, la cerramos.
  if (activeDbConnection) {
      activeDbConnection.close();
  }

  try {
      activeDbConnection = dbManager.connectDatabase(filePath);
      return { success: true, path: filePath };
  } catch (error) {
      console.error("Error al crear la base de datos:", error);
      return { success: false, error: error.message };
  }
});

// --- NUEVO: Manejador para abrir una base de datos existente.
ipcMain.handle("db:open", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Abrir Base de Datos",
      properties: ["openFile"],
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
  });

  if (canceled || filePaths.length === 0) {
      return { success: false, reason: "cancelled" };
  }

  const filePath = filePaths[0];
  if (activeDbConnection) {
      activeDbConnection.close();
  }

  try {
      activeDbConnection = dbManager.connectDatabase(filePath);
      return { success: true, path: filePath };
  } catch (error) {
      console.error("Error al abrir la base de datos:", error);
      return { success: false, error: error.message };
  }
});

// --- NUEVO: Manejador para guardar una copia de la base de datos actual.
// Utiliza el método .backup() de better-sqlite3, que es muy eficiente.
ipcMain.handle("db:saveAs", async () => {
  if (!activeDbConnection) {
      return { success: false, error: "No hay una base de datos activa para guardar." };
  }
  
  const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar Base de Datos Como",
      defaultPath: "copia_proyecto.sqlite",
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
  });

  if (canceled || !filePath) {
      return { success: false, reason: "cancelled" };
  }

  try {
      await activeDbConnection.backup(filePath);
      return { success: true, path: filePath };
  } catch (error) {
      console.error("Error al guardar la base de datos:", error);
      return { success: false, error: error.message };
  }
});


// --- CAMBIO: El manejador ahora usa la conexión activa.
ipcMain.handle("db:getData", (event, cufe) => {
  if (!activeDbConnection) return { success: false, error: "No hay base de datos cargada" };
  if (!cufe) return { success: false, error: "CUFE no proporcionado" };
  try {
      // --- CAMBIO: La data ahora viene en un formato diferente, pero solo la pasamos.
      const data = dbManager.getDataForCufe(activeDbConnection, cufe);
      return { success: true, data };
  } catch (error) {
      return { success: false, error: error.message };
  }
});

// --- CAMBIO: El manejador ahora desestructura el payload completo { cufe, metadata, details }.
ipcMain.handle("db:saveData", (event, payload) => {
  if (!activeDbConnection) return { success: false, error: "No hay base de datos cargada" };
  // --- CAMBIO: validación del payload.
  if (!payload || !payload.cufe || !payload.metadata || !payload.details) {
    return { success: false, error: "Datos incompletos para guardar." };
  }
  return dbManager.saveDataForCufe(activeDbConnection, payload);
});


app.whenReady().then(() => {

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
