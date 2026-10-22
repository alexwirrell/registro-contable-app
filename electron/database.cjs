// electron/database.cjs

const Database = require('better-sqlite3');

function connectDatabase(dbPath) {
    const db = new Database(dbPath);
    console.log(`Base de datos conectada en: ${dbPath}`);

    const createDocumentsTableStmt = `
    CREATE TABLE IF NOT EXISTS documentos (
        cufe TEXT PRIMARY KEY,
        nombreArchivoFinal TEXT,
        consecutivo TEXT,
        comentarios TEXT,
        positions_json TEXT,
        -- Añadir la nueva columna para retenciones dinámicas
        retencionesDinamicas_json TEXT 
    );
    `;
    db.exec(createDocumentsTableStmt);

    const createDetailsTableStmt = `
    CREATE TABLE IF NOT EXISTS detalles_documento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cufe TEXT NOT NULL,
        tipoDoc TEXT,
        nitComprador TEXT,
        razonSocialComprador TEXT,
        nitVendedor TEXT,
        razonSocialVendedor TEXT,
        nroDocumento TEXT,
        fechaEmision TEXT,
        fechaVencimiento TEXT,
        renglon TEXT,
        codigo TEXT,
        cuentaContable TEXT,
        centroDeCostos TEXT,
        conceptoRetencion TEXT,
        descripcion TEXT,
        descripcionRegistro TEXT,
        um TEXT,
        cantidad REAL,
        precioUnitario REAL,
        valor REAL,
        tipoRegistro TEXT,
        FOREIGN KEY (cufe) REFERENCES documentos (cufe) ON DELETE CASCADE
    );
    `;
    db.exec(createDetailsTableStmt);
    
    const createIndexStmt = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_cufe_renglon ON detalles_documento (cufe, renglon, descripcion);';
    db.exec(createIndexStmt);

    return db;
}

function getDataForCufe(db, cufe) {
    if (!db) throw new Error("La conexión a la base de datos no está activa.");

    const metadataStmt = db.prepare('SELECT * FROM documentos WHERE cufe = ?');
    const metadata = metadataStmt.get(cufe);

    if (!metadata) {
        return null;
    }
    
    // --- CAMBIO: Parsear positions_json ---
    if (metadata.positions_json) {
        try {
            metadata.positions = JSON.parse(metadata.positions_json);
        } catch (e) {
            console.error("Error al parsear positions_json:", e);
            metadata.positions = {};
        }
    } else {
        metadata.positions = {};
    }
    delete metadata.positions_json; // Eliminar el campo JSON ya parseado

    // --- NUEVO: Parsear retencionesDinamicas_json ---
    if (metadata.retencionesDinamicas_json) {
        try {
            // Asegurarse de que sea un array
            const parsedRetenciones = JSON.parse(metadata.retencionesDinamicas_json);
            metadata.retencionesDinamicas = Array.isArray(parsedRetenciones) ? parsedRetenciones : [];
        } catch (e) {
            console.error("Error al parsear retencionesDinamicas_json:", e);
            metadata.retencionesDinamicas = [];
        }
    } else {
        metadata.retencionesDinamicas = []; // Inicializar como array vacío si no existe
    }
    delete metadata.retencionesDinamicas_json; // Eliminar el campo JSON ya parseado
    // --- FIN NUEVO ---

    const detailsStmt = db.prepare('SELECT * FROM detalles_documento WHERE cufe = ? ORDER BY CAST(renglon AS INTEGER)');
    const details = detailsStmt.all(cufe);

    // --- CORRECCIÓN PASO 1: Formatear los datos al leerlos ---
    const formattedDetails = details.map(row => {
        const newRow = { ...row };
        const fieldsToFormat = ['nitComprador', 'nitVendedor', 'renglon', 'codigo', 'cuentaContable'];

        fieldsToFormat.forEach(field => {
            const value = newRow[field];
            if (value !== null && value !== undefined) {
                const stringValue = String(value);
                if (stringValue.match(/^\d+\.0$/)) {
                    newRow[field] = stringValue.slice(0, -2);
                } else {
                    newRow[field] = stringValue;
                }
            }
        });

        return newRow;
    });

    return { metadata, details: formattedDetails };
}

function saveDataForCufe(db, { cufe, metadata, details }) {
    if (!db) throw new Error("La conexión a la base de datos no está activa.");
    
    const transaction = db.transaction(() => {
        const upsertMetadataStmt = db.prepare(`
            INSERT INTO documentos (cufe, nombreArchivoFinal, consecutivo, comentarios, positions_json, retencionesDinamicas_json)
            VALUES (@cufe, @nombreArchivoFinal, @consecutivo, @comentarios, @positions_json, @retencionesDinamicas_json)
            ON CONFLICT(cufe) DO UPDATE SET
                nombreArchivoFinal = excluded.nombreArchivoFinal,
                consecutivo = excluded.consecutivo,
                comentarios = excluded.comentarios,
                positions_json = excluded.positions_json,
                -- Añadir la actualización de retencionesDinamicas_json --
                retencionesDinamicas_json = excluded.retencionesDinamicas_json;
        `);
        
        upsertMetadataStmt.run({
            cufe,
            nombreArchivoFinal: metadata.nombreArchivoFinal,
            consecutivo: metadata.consecutivo,
            comentarios: metadata.comentarios,
            positions_json: JSON.stringify(metadata.positions || {}),
            // --- NUEVO: Añadir retencionesDinamicas_json ---
            retencionesDinamicas_json: JSON.stringify(metadata.retencionesDinamicas || [])
            // --- FIN NUEVO ---
        });

        const deleteStmt = db.prepare('DELETE FROM detalles_documento WHERE cufe = ?');
        deleteStmt.run(cufe);

        const insertStmt = db.prepare(`
            INSERT INTO detalles_documento (
                cufe, tipoDoc, nitComprador, razonSocialComprador, nitVendedor, razonSocialVendedor,
                nroDocumento, fechaEmision, fechaVencimiento, renglon, codigo,
                cuentaContable, centroDeCostos, conceptoRetencion, descripcion, descripcionRegistro, um, 
                cantidad, precioUnitario, valor, tipoRegistro
            ) VALUES (
                @cufe, @tipoDoc, @nitComprador, @razonSocialComprador, @nitVendedor, @razonSocialVendedor,
                @nroDocumento, @fechaEmision, @fechaVencimiento, @renglon, @codigo,
                @cuentaContable, @centroDeCostos, @conceptoRetencion, @descripcion, @descripcionRegistro, @um, 
                @cantidad, @precioUnitario, @valor, @tipoRegistro
            )
        `);

        for (const row of details) {
            const sanitizedRow = { ...row };
            const fieldsToSanitize = ['nitComprador', 'nitVendedor', 'renglon', 'codigo', 'cuentaContable'];

            fieldsToSanitize.forEach(field => {
                const value = sanitizedRow[field];
                if (value !== null && value !== undefined && value !== '') {
                    sanitizedRow[field] = String(Math.round(Number(value)));
                }
            });

            insertStmt.run({
                cufe,
                ...sanitizedRow,
                cuentaContable: sanitizedRow.cuentaContable || null,
                centroDeCostos: sanitizedRow.centroDeCostos || null,
                conceptoRetencion: sanitizedRow.conceptoRetencion || null,
                descripcionRegistro: sanitizedRow.descripcionRegistro || null,
            });
        }
    });

    try {
        transaction();
        return { success: true };
    } catch (error) {
        console.error("Error en la transacción de guardado:", error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    connectDatabase,
    getDataForCufe,
    saveDataForCufe,
};