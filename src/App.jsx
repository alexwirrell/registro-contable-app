// src/App.jsx

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Menu,
  FileJson,
  Database,
  FolderOpen,
  Save,
  PlusCircle,
  X,
  Trash2,
} from "lucide-react";
import { XMLParser } from "fast-xml-parser";

import DataPanel from "./components/DataPanel";
import Annotation from "./components/Annotation";
import Toast from "./components/Toast";
import XmlPanel from "./components/XmlPanel";
import LookupModal from "./components/LookupModal";
import { useResizeObserver } from "./hooks/useResizeObserver";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const initialFormData = {
  nombreArchivoFinal: "",
  consecutivo: "",
  totalPagar: 0,
  comentarios: "",
  retencionesDinamicas: [],
  positions: {},
};

const extractVbaLogicData = (xmlData) => {
  const rootNode = xmlData.Invoice || xmlData.CreditNote || xmlData.DebitNote;
  if (!rootNode) return { cufe: null, rows: [] };

  const safeGet = (path, obj = rootNode) => {
    let value = path.split(".").reduce((p, c) => p && p[c], obj);

    if (
      typeof value === "object" &&
      value !== null &&
      value.hasOwnProperty("#text")
    ) {
      return value["#text"];
    }
    return value;
  };

  const cufe = safeGet("UUID");

  // Datos comunes (Encabezado)
  const commonData = {
    tipoDoc: safeGet("ProfileID"),
    nitVendedor: safeGet(
      "AccountingSupplierParty.Party.PartyTaxScheme.CompanyID"
    ),
    razonSocialVendedor: safeGet(
      "AccountingSupplierParty.Party.PartyName.Name"
    ),
    nitComprador: safeGet(
      "AccountingCustomerParty.Party.PartyTaxScheme.CompanyID"
    ),
    razonSocialComprador: safeGet(
      "AccountingCustomerParty.Party.PartyTaxScheme.RegistrationName"
    ),
    nroDocumento: safeGet("ID"),
    fechaEmision: safeGet("IssueDate"),
    fechaVencimiento: safeGet("PaymentMeans.PaymentDueDate"),
  };

  const rows = [];
  let lines =
    rootNode.InvoiceLine || rootNode.CreditNoteLine || rootNode.DebitNoteLine;
  if (lines && !Array.isArray(lines)) lines = [lines];

  if (lines) {
    lines.forEach((line) => {
      const lineData = {
        renglon: safeGet("ID", line),
        codigo: safeGet("Item.StandardItemIdentification.ID", line),
        descripcion: safeGet("Item.Description", line),
        um: safeGet("Price.BaseQuantity.@_unitCode", line),
        cantidad:
          safeGet("InvoicedQuantity", line) ||
          safeGet("CreditedQuantity", line),
        precioUnitario: safeGet("Price.PriceAmount", line),
        valor: safeGet("LineExtensionAmount", line),
      };

      const baseRow = {
        ...commonData,
        ...lineData,
        // Añadimos los campos de enriquecimiento con valores por defecto
        cuentaContable: "",
        centroDeCostos: "",
        conceptoRetencion: "",
        // La descripción del registro por defecto será la misma que la del ítem
        descripcionRegistro: lineData.descripcion,
        tipoRegistro: "BASE",
      };
      rows.push(baseRow);

      // Impuestos de la línea (como en tu macro)
      let taxTotals = safeGet("TaxTotal", line);
      if (taxTotals && !Array.isArray(taxTotals)) taxTotals = [taxTotals];
      if (taxTotals) {
        taxTotals.forEach((tax) => {
          rows.push({
            ...commonData,
            renglon: lineData.renglon,
            descripcion: `${safeGet(
              "TaxSubtotal.TaxCategory.TaxScheme.Name",
              tax
            )} (${safeGet("TaxSubtotal.TaxCategory.Percent", tax)}%)`,
            valor: safeGet("TaxSubtotal.TaxAmount", tax),
            codigo: "",
            um: "",
            cantidad: null,
            precioUnitario: null,
            cuentaContable: "",
            centroDeCostos: "",
            conceptoRetencion: "",
            descripcionRegistro: "",
            tipoRegistro: "IMPTO",
          });
        });
      }
    });
  }
  return { cufe, rows };
};

function App() {
  // --- ESTADO PRINCIPAL ---
  const [pdfList, setPdfList] = useState([]);
  const [xmlList, setXmlList] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeFormData, setActiveFormData] = useState(null);
  const [xmlData, setXmlData] = useState(null);
  const [gridData, setGridData] = useState([]);
  const [activeCufe, setActiveCufe] = useState(null);

  const [pucData, setPucData] = useState([]);
  const [costCenterData, setCostCenterData] = useState([]);
  const [retentionConceptData, setRetentionConceptData] = useState([]);
  const [modalState, setModalState] = useState({
    isOpen: false,
    catalogType: null,
    targetCell: null, // { rowIndex, columnId }
  });
  const [activeDbPath, setActiveDbPath] = useState(null);

  // --- ESTADO DE UI ---
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [dragging, setDragging] = useState(null);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [toastMessage, setToastMessage] = useState("");
  const [panelLayout, setPanelLayout] = useState([20, 55, 25]); // [izquierdo, central, derecho]
  const isLeftPanelVisible = panelLayout[0] > 0;

  // --- REFS ---
  // Refs para elementos del DOM
  const canvasRef = useRef(null);
  const renderTask = useRef(null);
  const visorContainerRef = useRef(null);
  const activeElementRef = useRef(null);
  const mainPanelGroupRef = useRef(null);
  const dimensions = useResizeObserver(visorContainerRef);

  // --- VALORES DERIVADOS (useMemo) ---
  const pairedPdfList = useMemo(() => {
    // Creamos un Set con los nombres base de los XMLs para búsquedas rápidas
    const xmlBaseNames = new Set(
      xmlList.map((xml) =>
        xml.path
          .split(/[\\/]/)
          .pop()
          .replace(/\.xml$/i, "")
      )
    );

    // Mapeamos la lista de PDFs y añadimos el flag 'hasXml'
    return pdfList.map((pdf) => {
      const pdfBaseName = pdf.path
        .split(/[\\/]/)
        .pop()
        .replace(/\.pdf$/i, "");
      return {
        ...pdf,
        hasXml: xmlBaseNames.has(pdfBaseName),
      };
    });
  }, [pdfList, xmlList]); // Se recalcula solo si pdfList o xmlList cambian

  // --- LÓGICA DE PANELES ---
  const toggleLeftPanel = () => {
    // 1. Determinar el nuevo layout basado en el estado actual (usando el estado de React)
    //    Esta parte es principalmente para mantener sincronizado nuestro estado de React
    //    y para cualquier otro uso en el renderizado (como el título del botón).
    let newLayout;
    if (panelLayout[0] > 0) {
      // Está visible, lo colapsamos
      const newCentralSize = panelLayout[1] + panelLayout[0];
      newLayout = [0, newCentralSize, panelLayout[2]];
    } else {
      // Está colapsado, lo expandimos
      newLayout = [20, 55, 25]; // O restaurar un layout guardado
    }

    // 2. Actualizar el estado de React para mantener la coherencia
    setPanelLayout(newLayout);

    // 3. Forzar el cambio directamente en el componente PanelGroup
    //    Esta es la parte crucial que debería garantizar el cambio visual.
    if (
      mainPanelGroupRef.current &&
      typeof mainPanelGroupRef.current.setLayout === "function"
    ) {
      mainPanelGroupRef.current.setLayout(newLayout);
    } else {
      console.warn(
        "No se pudo obtener una referencia válida a PanelGroup o el método setLayout no está disponible."
      );
    }
  };

  // --- Lógica de Manejo de Formularios ---

  const handleClearFocus = () => {
    setActiveFieldId(null);
    if (activeElementRef.current) {
      activeElementRef.current.blur();
      activeElementRef.current = null;
    }
  };

  const handleRemoveLastRetention = () => {
    setActiveFormData((prevData) => {
      if (!prevData || prevData.retencionesDinamicas.length === 0) {
        return prevData;
      }
      const newRetentions = prevData.retencionesDinamicas.slice(0, -1);

      return {
        ...prevData,
        retencionesDinamicas: newRetentions,
      };
    });
  };

  const handleFieldFocus = (id, e) => {
    setActiveFieldId(id);
    if (e) activeElementRef.current = e.target;
  };

  const handleFormChange = (fieldName, value) => {
    setActiveFormData((prevData) => ({
      ...prevData,
      [fieldName]: value,
    }));
  };

  const handleAddRetention = () => {
    const newRetention = { id: crypto.randomUUID(), nombre: "", valor: 0 };
    setActiveFormData((prevData) => ({
      ...prevData,
      retencionesDinamicas: [...prevData.retencionesDinamicas, newRetention],
    }));
  };

  const handleRemoveRetention = (retentionId) => {
    setActiveFormData((prevData) => ({
      ...prevData,
      retencionesDinamicas: prevData.retencionesDinamicas.filter(
        (r) => r.id !== retentionId
      ),
    }));
  };

  const handleRetentionChange = (retentionId, field, value) => {
    setActiveFormData((prevData) => ({
      ...prevData,
      retencionesDinamicas: prevData.retencionesDinamicas.map((r) =>
        r.id === retentionId ? { ...r, [field]: value } : r
      ),
    }));
  };

  const updatePdfData = (indexToUpdate, newFormData) => {
    setPdfList((currentList) =>
      currentList.map((pdf, index) =>
        index === indexToUpdate ? { ...pdf, formData: newFormData } : pdf
      )
    );
  };

  // --- Lógica de Anotaciones y Visor ---

  const getAnnotations = useCallback(() => {
    if (!activeFormData) return [];

    const formData = activeFormData;

    const allFields = [
      { id: "consecutivo", label: "Consecutivo", value: formData.consecutivo },
      { id: "totalPagar", label: "Total a Pagar", value: formData.totalPagar },
      { id: "comentarios", label: "Comentarios", value: formData.comentarios },

      ...formData.retencionesDinamicas.map((ret) => ({
        id: ret.id,
        label: ret.nombre || "Retención sin nombre",
        value: ret.valor,
      })),
    ];

    return allFields.map((field) => ({
      ...field,
      position: formData.positions[field.id],
    }));
  }, [activeFormData]);

  const handleClickToPlace = (e) => {
    if (!activeFieldId || dragging) return;
    const canvas = canvasRef.current;
    if (!canvas || e.target !== canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newX = (x / rect.width) * 100;
    const newY = (y / rect.height) * 100;

    setActiveFormData((prevData) => ({
      ...prevData,
      positions: {
        ...prevData.positions,
        [activeFieldId]: { x: newX, y: newY, page: currentPage },
      },
    }));

    setActiveFieldId(null);
  };

  const handleDragStart = (e, id) => {
    e.preventDefault();
    const annotationElement = e.currentTarget;
    const rect = annotationElement.getBoundingClientRect();

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragging({ id, offsetX, offsetY });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - dragging.offsetX;
    const y = e.clientY - rect.top - dragging.offsetY;

    const newX = (x / rect.width) * 100;
    const newY = (y / rect.height) * 100;
    setActiveFormData((prevData) => {
      const existingPage = prevData.positions[dragging.id]?.page || currentPage;
      return {
        ...prevData,
        positions: {
          ...prevData.positions,
          [dragging.id]: { x: newX, y: newY, page: existingPage },
        },
      };
    });
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const getVisorCursor = () => {
    if (dragging) {
      return "grabbing";
    }
    if (activeFieldId) {
      return "crosshair";
    }
    return "default";
  };

  // --- EFECTO ORQUESTADOR PRINCIPAL ---
  // Este useEffect es la ÚNICA fuente de verdad para cargar datos cuando cambia el documento.
  // ¡NUEVO! Función para guardar la tabla en la base de datos.

  const [isSaving, setIsSaving] = useState(false);

  const validateGridData = (data) => {
    if (!data || data.length === 0) return { valid: true, message: "" };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // Validaciones básicas
      if (!row.renglon || !row.descripcion) {
        return {
          valid: false,
          message: `Fila ${i + 1}: Renglón y Descripción son requeridos`,
        };
      }
    }

    return { valid: true, message: "" };
  };

  const resetAppState = () => {
    setPdfList([]);
    setXmlList([]);
    setActiveIndex(null);
    setActiveFormData(null);
    setGridData([]);
    setActiveCufe(null);
    // ... (puedes resetear otros estados si es necesario)
  };

  const handleNewDb = async () => {
    const result = await window.electronAPI.db.new();
    if (result.success) {
      setActiveDbPath(result.path);
      setToastMessage(`Nueva base de datos creada en: ${result.path}`);
      resetAppState(); // Limpiamos el estado para empezar de cero.
    } else if (result.reason !== "cancelled") {
      setToastMessage(`Error al crear la base de datos: ${result.error}`);
    }
  };

  const handleOpenDb = async () => {
    const result = await window.electronAPI.db.open();
    if (result.success) {
      setActiveDbPath(result.path);
      setToastMessage(`Base de datos abierta: ${result.path}`);
      resetAppState();
    } else if (result.reason !== "cancelled") {
      setToastMessage(`Error al abrir la base de datos: ${result.error}`);
    }
  };

  const handleSaveDbAs = async () => {
    if (!activeDbPath) {
      setToastMessage("Primero debe crear o abrir una base de datos.");
      return;
    }
    const result = await window.electronAPI.db.saveAs();
    if (result.success) {
      setToastMessage(`Base de datos guardada en: ${result.path}`);
    } else if (result.reason !== "cancelled") {
      setToastMessage(`Error al guardar la base de datos: ${result.error}`);
    }
  };

  // --- CAMBIO: handleSaveGridData ahora envía tanto los metadatos como los detalles.
  const handleSaveGridData = useCallback(async () => {
    if (!activeDbPath) {
      setToastMessage(
        "Por favor, cree o abra una base de datos antes de guardar."
      );
      return;
    }
    if (!activeCufe) {
      setToastMessage(
        "No hay un documento activo (CUFE) para guardar los datos."
      );
      return;
    }
    if (!activeFormData) {
      setToastMessage("No hay datos de formulario para guardar.");
      return;
    }

    const validation = validateGridData(gridData);
    if (!validation.valid) {
      setToastMessage(`Error de validación: ${validation.message}`);
      return;
    }

    setToastMessage("Guardando cambios en la base de datos...");

    try {
      // Preparamos los detalles (gridData)
      const detailsToSave = gridData.map((row) => {
        const { id, ...rowData } = row;
        return rowData;
      });

      // --- NUEVO: Preparamos los metadatos (activeFormData)
      const metadataToSave = {
        nombreArchivoFinal: activeFormData.nombreArchivoFinal,
        consecutivo: activeFormData.consecutivo,
        comentarios: activeFormData.comentarios,
        positions: activeFormData.positions,
        retencionesDinamicas: activeFormData.retencionesDinamicas,
      };

      // --- NUEVO: Construimos el payload completo
      const payload = {
        cufe: activeCufe,
        metadata: metadataToSave,
        details: detailsToSave,
      };

      const result = await window.electronAPI.db.saveData(payload);

      if (result.success) {
        setToastMessage("¡Cambios guardados exitosamente!");
      } else {
        setToastMessage(`Error al guardar: ${result.error}`);
      }
    } catch (error) {
      console.error("Error al guardar datos:", error);
      setToastMessage("Error al guardar los cambios.");
    }
  }, [activeCufe, gridData, activeFormData, activeDbPath]);

  // Refactorizamos la función de carga principal
  const loadDataForActiveDocument = useCallback(async () => {
    console.log(
      `--- INICIO DE CARGA DE DATOS (activeIndex: ${activeIndex}) ---`
    );

    setGridData([]);
    // --- CAMBIO: Reseteamos activeFormData con el estado inicial del PDF, no a null.
    // Esto asegura que si no hay datos en BD, el formulario no esté vacío.
    if (activeIndex !== null && pairedPdfList[activeIndex]) {
      setActiveFormData(pairedPdfList[activeIndex].formData);
    } else {
      setActiveFormData(null);
      console.log("No hay documento activo válido. Fin.");
      return;
    }

    const activePdf = pairedPdfList[activeIndex];

    const pdfBaseName = activePdf.path
      .split(/[\\/]/)
      .pop()
      .replace(/\.pdf$/i, "");
    const correspondingXml = xmlList.find((xml) => {
      const xmlBaseName = xml.path
        .split(/[\\/]/)
        .pop()
        .replace(/\.xml$/i, "");
      return xmlBaseName === pdfBaseName;
    });

    if (correspondingXml) {
      try {
        const xmlContent = new TextDecoder().decode(correspondingXml.data);
        const options = {
          ignoreAttributes: false,
          removeNSPrefix: true,
          parseAttributeValue: true,
        };
        const parser = new XMLParser(options);
        let parsedData = parser.parse(xmlContent);
        // ... (lógica de parseo de XML anidado sin cambios)
        if (parsedData.AttachedDocument) {
          const embeddedXml =
            parsedData.AttachedDocument?.Attachment?.ExternalReference
              ?.Description;
          if (typeof embeddedXml === "string") {
            parsedData = parser.parse(embeddedXml);
          }
        }

        const { cufe, rows: xmlRows } = extractVbaLogicData(parsedData);

        if (cufe) {
          setActiveCufe(cufe);

          const dbResult = await window.electronAPI.db.getData(cufe);
          console.log("Resultado de la consulta a la BD:", dbResult);

          // --- LÓGICA DE CARGA MEJORADA ---
          if (
            dbResult.success &&
            dbResult.data &&
            dbResult.data.details?.length > 0
          ) {
            console.log(
              `%cCargando estado completo desde la base de datos.`,
              "color: green; font-weight: bold;"
            );
            const { metadata, details } = dbResult.data;
            // 1. Cargamos la tabla (gridData)
            setGridData(details);

            // 2. Reconstruimos y cargamos el formulario (activeFormData)
            // --- CORRECCIÓN: Usar metadata.retencionesDinamicas si existe, sino reconstruir desde details ---
            let reconstructedRetenciones = [];
            if (
              metadata.retencionesDinamicas &&
              Array.isArray(metadata.retencionesDinamicas)
            ) {
              // Si metadata incluye retenciones originales (con sus IDs), usarlas
              reconstructedRetenciones = metadata.retencionesDinamicas.map(
                (r) => ({
                  id: r.id, // <-- Mantener el ID original
                  nombre: r.nombre,
                  valor: r.valor || 0, // Asegurar valor por si acaso
                })
              );
            } else {
              // Si no se guardaron en metadata (caso antiguo o error), reconstruir desde details
              // Esto probablemente causará el bug si había posiciones guardadas para esas retenciones
              console.warn(
                "No se encontraron 'retencionesDinamicas' en metadata. Reconstruyendo desde details. Las anotaciones de retenciones podrían no cargarse correctamente."
              );
              reconstructedRetenciones = details
                .filter((row) => row.tipoRegistro === "RETENCION")
                .map((row) => ({
                  id: crypto.randomUUID(), // <-- Nuevo ID, no coincidirá con positions
                  nombre: row.descripcion,
                  valor: row.valor,
                }));
            }

            // Extraer total de los detalles si no está en metadata
            const totalRow = details.find(
              (row) => row.tipoRegistro === "TOTAL"
            );

            // Combinamos metadatos de la BD con datos extraídos de los detalles y reconstruidos
            const reconstructedFormData = {
              nombreArchivoFinal:
                metadata.nombreArchivoFinal ||
                activePdf.formData.nombreArchivoFinal,
              consecutivo: metadata.consecutivo || "",
              comentarios: metadata.comentarios || "",
              positions: metadata.positions || {}, // <-- Asegurar que las posiciones se carguen
              retencionesDinamicas: reconstructedRetenciones, // <-- Usar las reconstruidas con IDs correctos
              totalPagar: totalRow ? totalRow.valor : 0,
            };

            setActiveFormData(reconstructedFormData);
            setToastMessage(
              "Estado de trabajo cargado desde la base de datos."
            );
          } else {
            console.log(
              `%cCargando datos originales del XML (${xmlRows.length} filas).`,
              "color: blue; font-weight: bold;"
            );
            setGridData(xmlRows);
            // El activeFormData ya fue seteado al inicio con los datos del PDF.
            setToastMessage("Datos cargados del XML original.");
          }
        } else {
          setToastMessage("No se pudo encontrar el CUFE en el archivo XML.");
        }
      } catch (error) {
        console.error(
          "Error catastrófico durante el parseo/extracción:",
          error
        );
        setToastMessage("Error al procesar el archivo XML.");
      }
    } else {
      console.log("No se encontró XML para el PDF activo.");
    }
  }, [activeIndex, pairedPdfList, xmlList]);

  // useEffect actualizado
  useEffect(() => {
    loadDataForActiveDocument();
  }, [loadDataForActiveDocument]);

  const loadOriginalXmlData = useCallback(async () => {
    if (activeIndex === null || !pairedPdfList[activeIndex]) {
      setToastMessage("No hay documento activo.");
      return;
    }

    const activePdf = pairedPdfList[activeIndex];
    const pdfBaseName = activePdf.path
      .split(/[\\/]/)
      .pop()
      .replace(/\.pdf$/i, "");
    const correspondingXml = xmlList.find((xml) => {
      const xmlBaseName = xml.path
        .split(/[\\/]/)
        .pop()
        .replace(/\.xml$/i, "");
      return xmlBaseName === pdfBaseName;
    });

    if (correspondingXml) {
      try {
        setToastMessage("Cargando datos originales del XML...");

        const xmlContent = new TextDecoder().decode(correspondingXml.data);
        const options = {
          ignoreAttributes: false,
          removeNSPrefix: true,
          parseAttributeValue: true,
        };
        const parser = new XMLParser(options);
        let parsedData = parser.parse(xmlContent);
        if (parsedData.AttachedDocument) {
          const embeddedXml =
            parsedData.AttachedDocument?.Attachment?.ExternalReference
              ?.Description;
          if (typeof embeddedXml === "string") {
            parsedData = parser.parse(embeddedXml);
          }
        }

        const { cufe, rows } = extractVbaLogicData(parsedData);

        if (cufe) {
          setActiveCufe(cufe);
          setGridData(rows);
          setToastMessage(
            "Datos originales del XML cargados. Cambios descartados."
          );
        } else {
          setToastMessage("No se pudo encontrar el CUFE en el XML.");
        }
      } catch (error) {
        console.error("Error al cargar datos originales:", error);
        setToastMessage("Error al cargar datos originales del XML.");
      }
    } else {
      setToastMessage("No se encontró XML asociado.");
    }
  }, [activeIndex, pairedPdfList, xmlList]);

  // Actualizamos handleRefreshGridData para usar la nueva función
  const handleRefreshGridData = useCallback(() => {
    loadOriginalXmlData();
  }, [loadOriginalXmlData]);

  useEffect(() => {
    if (activeIndex === null) {
      setXmlData(null);
    }
  }, [activeIndex]);

  // --- Lógica de Archivos y Plantillas ---

  const handleFileOpen = async () => {
    const filesFromDialog = await window.electronAPI.openFile();
    if (!filesFromDialog || filesFromDialog.length === 0) return;

    const newPdfs = [];
    const newXmls = [];

    // 1. Separamos los archivos por tipo
    for (const file of filesFromDialog) {
      const extension = file.path.split(".").pop().toLowerCase();
      if (extension === "pdf") {
        // Evitamos duplicados
        if (!pdfList.some((pdf) => pdf.path === file.path)) {
          newPdfs.push(file);
        }
      } else if (extension === "xml") {
        // Evitamos duplicados
        if (!xmlList.some((xml) => xml.path === file.path)) {
          newXmls.push(file);
        }
      }
    }

    // 2. Procesamos los nuevos PDFs (si hay)
    if (newPdfs.length > 0) {
      const newPdfDocs = await Promise.all(
        newPdfs.map(async (file) => {
          const loadingTask = pdfjsLib.getDocument({ data: file.data });
          const pdf = await loadingTask.promise;
          const originalFileName = file.path
            .split(/[\\/]/)
            .pop()
            .replace(/\.pdf$/i, "");

          return {
            path: file.path,
            doc: pdf,
            formData: {
              ...initialFormData,
              nombreArchivoFinal: `${originalFileName}_procesado.pdf`,
            },
          };
        })
      );

      setPdfList((prevList) => [...prevList, ...newPdfDocs]);
      if (activeIndex === null && newPdfDocs.length > 0) setActiveIndex(0);
    }

    // 3. Simplemente añadimos los nuevos XMLs a su lista
    if (newXmls.length > 0) {
      const newXmlDocs = await Promise.all(
        newXmls.map(async (file) => {
          const xmlContent = new TextDecoder().decode(file.data);
          // Extraer CUFE del XML para usarlo posteriormente
          const options = {
            ignoreAttributes: false,
            removeNSPrefix: true,
            parseAttributeValue: true,
          };
          const parser = new XMLParser(options);
          let parsedData = parser.parse(xmlContent);
          if (parsedData.AttachedDocument) {
            const embeddedXml =
              parsedData.AttachedDocument?.Attachment?.ExternalReference
                ?.Description;
            if (typeof embeddedXml === "string") {
              parsedData = parser.parse(embeddedXml);
            }
          }
          const { cufe } = extractVbaLogicData(parsedData);

          return {
            path: file.path,
            data: file.data,
            cufe: cufe, // Guardamos el CUFE extraído
          };
        })
      );

      setXmlList((prevList) => [...prevList, ...newXmlDocs]);
    }
  };

  const handleSavePdf = async () => {
    if (activeIndex === null) {
      setToastMessage("Seleccione un PDF para guardar.");
      return;
    }

    updatePdfData(activeIndex, activeFormData);

    const activePdf = pdfList[activeIndex];
    const formData = activeFormData;

    const annotationsToSave = getAnnotations().filter((a) => a.position);

    const finalFileName =
      formData.nombreArchivoFinal.trim() ||
      activePdf.path.split(/[\\/]/).pop().replace(".pdf", "") +
        "_procesado.pdf";

    const payload = {
      originalPath: activePdf.path,
      annotations: annotationsToSave,
      defaultPath: finalFileName,
    };

    try {
      const result = await window.electronAPI.savePdf(payload);

      if (result.success) {
        setToastMessage("PDF guardado exitosamente.");
      } else if (result.reason !== "cancelled") {
        setToastMessage("Error al guardar el PDF.");
      }
    } catch (error) {
      console.error("Error al invocar 'savePdf':", error);
      setToastMessage(
        "Ocurrió un error inesperado al intentar guardar el PDF."
      );
    }
  };

  const handleSaveTemplate = async () => {
    if (activeIndex === null || !activeFormData) {
      setToastMessage("Seleccione un PDF para crear una plantilla.");
      return;
    }

    const templateData = {
      retenciones: activeFormData.retencionesDinamicas.map((r) => ({
        id: r.id,
        nombre: r.nombre,
      })),
      positions: activeFormData.positions,
    };

    try {
      const result = await window.electronAPI.saveTemplate(templateData);
      if (result.success) {
        setToastMessage(`Plantilla guardada exitosamente.`);
      } else if (result.reason !== "cancelled") {
        setToastMessage(`Error al guardar la plantilla.`);
      }
    } catch (error) {
      console.error("Error al guardar plantilla:", error);
      setToastMessage("Error al guardar la plantilla.");
    }
  };

  const handleLoadTemplate = async () => {
    if (activeIndex === null) {
      setToastMessage("Seleccione un PDF para aplicar la plantilla.");
      return;
    }

    try {
      const result = await window.electronAPI.loadTemplate();
      if (!result.success) {
        if (result.reason !== "cancelled") {
          setToastMessage(`Error al cargar la plantilla: ${result.reason}`);
        }
        return;
      }

      const templateData = result.data;

      const newRetentions = templateData.retenciones.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        valor: 0,
      }));

      const newPositions = { ...templateData.positions };

      const newFormData = {
        ...activeFormData,
        retencionesDinamicas: newRetentions,
        positions: newPositions,
      };

      setActiveFormData(newFormData);
      updatePdfData(activeIndex, newFormData);

      setActiveFieldId(null);
      setToastMessage("Plantilla cargada exitosamente.");
    } catch (error) {
      console.error("Error al cargar plantilla:", error);
      setToastMessage("Error al cargar la plantilla.");
    }
  };

  // Efecto para renderizar el PDF
  useEffect(() => {
    if (activeIndex === null || !pdfList[activeIndex] || !canvasRef.current) {
      if (renderTask.current) {
        renderTask.current.cancel();
      }
      return;
    }

    let isCancelled = false;
    const renderActivePage = async () => {
      if (renderTask.current) {
        renderTask.current.cancel();
      }

      const pdfDoc = pdfList[activeIndex].doc;
      const page = await pdfDoc.getPage(currentPage);

      if (isCancelled) return;

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const container = canvas.parentElement.parentElement;

      if (container.clientWidth === 0) return;

      const scaleToFit =
        container.clientWidth / page.getViewport({ scale: 1.0 }).width;

      const finalScale = scaleToFit * zoom;

      const viewport = page.getViewport({ scale: finalScale });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);

      const newWidth = viewport.width;
      const newHeight = viewport.height;

      canvas.style.width = `${newWidth}px`;
      canvas.style.height = `${newHeight}px`;

      if (
        canvasDimensions.width !== newWidth ||
        canvasDimensions.height !== newHeight
      ) {
        setCanvasDimensions({ width: newWidth, height: newHeight });
      }

      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        transform: transform,
      };

      renderTask.current = page.render(renderContext);

      try {
        await renderTask.current.promise;
      } catch (error) {
        if (error.name !== "RenderingCancelledException") {
          console.error("Error al renderizar PDF:", error);
        }
      } finally {
        if (!isCancelled) {
          renderTask.current = null;
        }
      }
    };

    renderActivePage();

    return () => {
      isCancelled = true;
      if (renderTask.current) {
        renderTask.current.cancel();
        renderTask.current = null;
      }
    };
  }, [activeIndex, pdfList, currentPage, zoom, dimensions]);

  // --- Lógica de Navegación y Atajos ---
  const handleDocumentChange = (newIndex) => {
    if (activeIndex !== null && activeFormData) {
      updatePdfData(activeIndex, activeFormData);
    }
    setActiveIndex(newIndex);
    setCurrentPage(1);
    setZoom(1.0);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          if (activeIndex !== null && activeIndex < pairedPdfList.length - 1) {
            handleDocumentChange(activeIndex + 1);
          }
          break;
        case "ArrowLeft":
          if (activeIndex > 0) {
            handleDocumentChange(activeIndex - 1);
          }
          break;
        case "ArrowDown":
          if (
            pdfList[activeIndex] &&
            currentPage < pdfList[activeIndex].doc.numPages
          ) {
            setCurrentPage((p) => p + 1);
          }
          break;
        case "ArrowUp":
          if (currentPage > 1) {
            setCurrentPage((p) => p - 1);
          }
          break;
        case "+":
          e.preventDefault();
          handleAddRetention();
          break;
        case "-":
          e.preventDefault();
          handleRemoveLastRetention();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, pairedPdfList, currentPage, pdfList, activeFormData]);

  // --- NUEVO: LÓGICA DE CATÁLOGOS ---
  const handleLoadCatalog = useCallback(async (catalogType) => {
    setToastMessage(`Cargando archivo para ${catalogType}...`);
    const result = await window.electronAPI.loadCatalogFile();

    if (result.success) {
      switch (catalogType) {
        case "PUC":
          setPucData(result.data);
          break;
        case "Centro de Costos":
          setCostCenterData(result.data);
          break;
        case "Concepto de Retención":
          setRetentionConceptData(result.data);
          break;
        default:
          break;
      }
      setToastMessage(
        `Catálogo '${catalogType}' cargado con ${result.data.length} registros.`
      );
    } else if (result.reason !== "cancelled") {
      setToastMessage(`Error al cargar catálogo: ${result.error}`);
    }
  }, []);

  // --- NUEVO: LÓGICA PARA MANEJAR EL MODAL ---
  const openLookupModal = useCallback((rowIndex, columnId, catalogType) => {
    setModalState({
      isOpen: true,
      catalogType: catalogType,
      targetCell: { type: "grid", rowIndex, columnId },
    });
  }, []);

  const openRetentionLookupModal = useCallback((retentionId) => {
    setModalState({
      isOpen: true,
      catalogType: "Concepto de Retención", // Siempre será este tipo.
      // --- CAMBIO: 'targetCell' ahora indica que el objetivo es un campo del formulario.
      targetCell: { type: "form", retentionId },
    });
  }, []);

  const handleModalClose = useCallback(() => {
    setModalState({ isOpen: false, catalogType: null, targetCell: null });
  }, []);

  const handleModalSelect = useCallback(
    (selectedItem) => {
      if (!modalState.targetCell) return;

      const firstColumnKey = Object.keys(selectedItem)[0];
      const valueToInsert = selectedItem[firstColumnKey];

      const { type } = modalState.targetCell;

      // CASO 1: Actualizar una celda en la tabla (Grid)
      if (type === "grid") {
        const { rowIndex, columnId } = modalState.targetCell;

        // Usamos la forma funcional de setState para evitar problemas de "stale closures".
        setGridData((currentGridData) => {
          // React nos da la versión más reciente del estado aquí.
          return currentGridData.map((row, index) => {
            if (index === rowIndex) {
              return { ...row, [columnId]: valueToInsert };
            }
            return row;
          });
        });
      }

      // CASO 2: Actualizar un campo de retención en el formulario (Form)
      if (type === "form") {
        const { retentionId } = modalState.targetCell;
        // La función handleRetentionChange ya usa la forma funcional internamente,
        // por lo que es segura de usar aquí.
        handleRetentionChange(retentionId, "nombre", valueToInsert);
      }

      handleModalClose();
    },
    // Las dependencias se pueden simplificar, ya que no dependemos de 'gridData' directamente.
    [modalState.targetCell, handleModalClose, handleRetentionChange]
  );

  // =======================================================
  // FUNCIÓN CORREGIDA PARA PROCESAR LOS DATOS
  // =======================================================
  const handleProcessDataToXml = useCallback(() => {
    if (!activeFormData || !gridData || gridData.length === 0) {
      setToastMessage(
        "No hay datos de formulario o de la tabla para procesar."
      );
      return;
    }

    // 1. Hacemos una copia mutable de los datos actuales de la tabla.
    let updatedGridData = [...gridData];

    // Obtenemos una fila de referencia para los datos comunes (NIT, Razón Social, etc.)
    const referenceRow = updatedGridData[0];
    const consecutivo = activeFormData.consecutivo || "";

    // --- REGLA 1: Actualizar el consecutivo en todas las filas existentes ---
    updatedGridData = updatedGridData.map((row) => ({
      ...row,
      consecutivo: consecutivo,
    }));

    // --- REGLA 2: Agregar una fila por cada retención ---
    activeFormData.retencionesDinamicas.forEach((retencion) => {
      const newRetentionRow = {
        ...referenceRow, // Copiamos datos comunes
        consecutivo: consecutivo, // <<< CORRECCIÓN: Añadimos el consecutivo aquí
        renglon: (updatedGridData.length + 1).toString(), // Nuevo renglón consecutivo
        codigo: "",
        descripcion: retencion.nombre, // Descripción de la retención
        um: "",
        cantidad: "",
        precioUnitario: "",
        valor: retencion.valor, // Valor de la retención
        cuentaContable: "",
        centroDeCostos: "",
        conceptoRetencion: "",
        descripcionRegistro: retencion.nombre, // Descripción de la retención
        tipoRegistro: "RETENCION", // Un tipo para identificarlo
      };
      updatedGridData.push(newRetentionRow);
    });

    // --- REGLA 3: Agregar la fila del total a pagar ---
    const newTotalRow = {
      ...referenceRow, // Copiamos datos comunes
      consecutivo: consecutivo, // <<< CORRECCIÓN: Y también lo añadimos aquí
      renglon: (updatedGridData.length + 1).toString(), // Nuevo renglón
      codigo: "",
      descripcion: "TOTAL CUENTA POR PAGAR", // Descripción fija
      um: "",
      cantidad: "",
      precioUnitario: "",
      valor: activeFormData.totalPagar, // Valor del total
      cuentaContable: "",
      centroDeCostos: "",
      conceptoRetencion: "",
      descripcionRegistro: "TOTAL CUENTA POR PAGAR",
      tipoRegistro: "TOTAL", // Un tipo para identificarlo
    };
    updatedGridData.push(newTotalRow);

    // 4. Actualizamos el estado de la tabla con los nuevos datos
    setGridData(updatedGridData);
    setToastMessage("Datos procesados y añadidos a la tabla.");
  }, [activeFormData, gridData, setGridData]);

  // --- LÓGICA DE TABLA (XmlPanel) ---
  const handleGridDataChange = useCallback((newData) => {
    setGridData(newData);
  }, []);

  // --- NUEVO: Función para remover un solo documento ---
  const handleRemoveDocument = useCallback(
    (indexToRemove) => {
      const pdfToRemove = pairedPdfList[indexToRemove];
      if (!pdfToRemove) return;

      // 1. Filtramos la lista de PDFs
      const newPdfList = pdfList.filter((pdf) => pdf.path !== pdfToRemove.path);

      // 2. (Opcional pero recomendado) Filtramos el XML correspondiente si existe
      const pdfBaseName = pdfToRemove.path
        .split(/[\\/]/)
        .pop()
        .replace(/\.pdf$/i, "");
      const newXmlList = xmlList.filter((xml) => {
        const xmlBaseName = xml.path
          .split(/[\\/]/)
          .pop()
          .replace(/\.xml$/i, "");
        return xmlBaseName !== pdfBaseName;
      });

      setPdfList(newPdfList);
      setXmlList(newXmlList);

      // 3. Lógica para ajustar el índice activo
      if (newPdfList.length === 0) {
        setActiveIndex(null); // Si la lista está vacía
      } else if (activeIndex === indexToRemove) {
        // Si borramos el elemento activo, seleccionamos el anterior o el primero
        setActiveIndex(Math.max(0, indexToRemove - 1));
      } else if (activeIndex > indexToRemove) {
        // Si borramos un elemento antes del activo, el índice del activo se reduce en 1
        setActiveIndex(activeIndex - 1);
      }
      // Si borramos un elemento después del activo, el activeIndex no necesita cambiar.
    },
    [pdfList, xmlList, activeIndex, pairedPdfList]
  );

  // --- NUEVO: Función para limpiar todos los documentos ---
  const handleClearAllDocuments = () => {
    setPdfList([]);
    setXmlList([]);
    setActiveIndex(null);
    setGridData([]);
    setActiveFormData(null);
    setToastMessage("Lista de documentos limpiada.");
  };

  // =======================================================
  // JSX - RENDERIZADO
  // =======================================================
  return (
    <div className="h-screen bg-gray-100 font-sans flex flex-col">
      <div className="flex-grow h-full">
        <PanelGroup
          direction="horizontal"
          ref={mainPanelGroupRef}
          className="h-full"
          onLayout={setPanelLayout} // <-- Sincroniza el estado
        >
          {/* ================= PANEL IZQUIERDO ================= */}
          <Panel defaultSize={20} minSize={15} collapsible={true}>
            <div className="p-4 flex flex-col h-full bg-gray-200 relative">
              {" "}
              {/* ¡BOTÓN DE MENÚ (VERSIÓN VISIBLE)! */}
              {isLeftPanelVisible && (
                <button
                  onClick={toggleLeftPanel}
                  className="absolute top-2 right-2 z-10 p-2 rounded-md hover:bg-gray-300"
                  title="Ocultar panel de archivos"
                >
                  <Menu size={20} />
                </button>
              )}
              {/* --- NUEVO: Sección para manejar la base de datos --- */}
              <div className="flex-none border-b border-gray-400 pb-4 mb-4">
                <h3 className="text-md font-bold mb-2 flex items-center">
                  <Database size={18} className="mr-2" />
                  Base de Datos
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={handleNewDb}
                    className="w-full flex items-center justify-center text-sm bg-green-600 text-white font-bold py-1.5 px-2 rounded hover:bg-green-700 transition duration-300"
                  >
                    <PlusCircle size={16} className="mr-2" /> Nueva
                  </button>
                  <button
                    onClick={handleOpenDb}
                    className="w-full flex items-center justify-center text-sm bg-blue-600 text-white font-bold py-1.5 px-2 rounded hover:bg-blue-700 transition duration-300"
                  >
                    <FolderOpen size={16} className="mr-2" /> Abrir
                  </button>
                  <button
                    onClick={handleSaveDbAs}
                    disabled={!activeDbPath}
                    className="w-full flex items-center justify-center text-sm bg-purple-600 text-white font-bold py-1.5 px-2 rounded hover:bg-purple-700 transition duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Save size={16} className="mr-2" /> Guardar Como...
                  </button>
                </div>
                {activeDbPath && (
                  <div className="text-xs text-gray-600 mt-2 p-2 bg-green-100 border border-green-300 rounded">
                    <p className="font-bold">Activa:</p>
                    <p className="truncate" title={activeDbPath}>
                      ...{activeDbPath.slice(-40)}
                    </p>
                  </div>
                )}
                {!activeDbPath && (
                  <div className="text-xs text-gray-600 mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded">
                    <p className="font-bold">Ninguna base de datos cargada.</p>
                  </div>
                )}
              </div>
              <div className="flex-none mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-bold">Archivos Cargados</h2>
                  <button
                    onClick={handleClearAllDocuments}
                    disabled={pdfList.length === 0}
                    className="p-1.5 text-red-600 rounded-md hover:bg-red-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                    title="Limpiar toda la lista"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <button
                  onClick={handleFileOpen}
                  disabled={!activeDbPath}
                  className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition duration-300 flex-none disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Cargar Documentos
                </button>
              </div>
              <div className="flex-grow border-2 border-dashed border-gray-400 rounded-lg p-2 overflow-y-auto max-h-full min-h-0">
                {pairedPdfList.map((pdf, index) => (
                  <div
                    key={pdf.path}
                    className={`flex items-center justify-between p-2 rounded group ${
                      activeIndex === index
                        ? "bg-blue-200"
                        : "hover:bg-gray-300"
                    }`}
                  >
                    <div
                      className="flex-grow truncate cursor-pointer"
                      onClick={() => handleDocumentChange(index)}
                      title={pdf.path}
                    >
                      <div className="flex items-center">
                        <span
                          className={`truncate ${
                            activeIndex === index ? "font-semibold" : ""
                          }`}
                        >
                          {pdf.path.split(/[\\/]/).pop()}
                        </span>
                        {pdf.hasXml && (
                          <FileJson
                            size={16}
                            className="text-blue-600 flex-shrink-0 ml-2"
                            title="XML asociado encontrado"
                          />
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDocument(index);
                      }}
                      className="ml-2 p-1 rounded-full text-gray-500 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remover archivo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex-none mt-2 text-xs text-gray-500">
                {pairedPdfList.length} archivos cargados
              </div>
              <div className="flex-none mt-4 border-t pt-4">
                <h3 className="text-md font-bold mb-2">Catálogos de Sesión</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleLoadCatalog("PUC")}
                    className="w-full text-sm bg-gray-600 text-white font-bold py-1 px-2 rounded hover:bg-gray-700 transition duration-300"
                  >
                    Cargar PUC
                  </button>
                  <button
                    onClick={() => handleLoadCatalog("Centro de Costos")}
                    className="w-full text-sm bg-gray-600 text-white font-bold py-1 px-2 rounded hover:bg-gray-700 transition duration-300"
                  >
                    Cargar C. Costos
                  </button>
                  <button
                    onClick={() => handleLoadCatalog("Concepto de Retención")}
                    className="w-full text-sm bg-gray-600 text-white font-bold py-1 px-2 rounded hover:bg-gray-700 transition duration-300"
                  >
                    Cargar Retenciones
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-2 space-y-1">
                  {pucData.length > 0 && (
                    <p className="truncate">✓ PUC: {pucData.length} cuentas</p>
                  )}
                  {costCenterData.length > 0 && (
                    <p className="truncate">
                      ✓ C.C.: {costCenterData.length} centros
                    </p>
                  )}
                  {retentionConceptData.length > 0 && (
                    <p className="truncate">
                      ✓ Ret.: {retentionConceptData.length} conceptos
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-gray-300 hover:bg-blue-500 transition-colors flex-none" />

          {/* ================= PANEL CENTRAL (Anidado) ================= */}
          <Panel defaultSize={55} minSize={30}>
            <div className="relative h-full w-full">
              {/* ¡BOTÓN DE MENÚ (VERSIÓN OCULTA)! */}
              {!isLeftPanelVisible && (
                <button
                  onClick={toggleLeftPanel}
                  className="absolute top-2 left-2 z-20 p-2 rounded-md bg-gray-700 text-white hover:bg-gray-600"
                  title="Mostrar panel de archivos"
                >
                  <Menu size={20} />
                </button>
              )}
              <PanelGroup direction="vertical">
                <Panel defaultSize={75} minSize={40}>
                  <div
                    className={`p-4 flex flex-col h-full bg-gray-700 text-white ${
                      !isLeftPanelVisible ? "pl-16" : ""
                    }`}
                  >
                    {/* Controles Superiores */}
                    <div className="flex justify-between mb-2 flex-none">
                      <button
                        onClick={() =>
                          handleDocumentChange(Math.max(0, activeIndex - 1))
                        }
                        disabled={activeIndex === null || activeIndex === 0}
                        className="bg-gray-600 px-4 py-1 rounded disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span>
                        Documento {activeIndex !== null ? activeIndex + 1 : 0}{" "}
                        de {pairedPdfList.length}
                      </span>
                      <button
                        onClick={() =>
                          handleDocumentChange(
                            Math.min(pairedPdfList.length - 1, activeIndex + 1)
                          )
                        }
                        disabled={
                          activeIndex === null ||
                          activeIndex === pairedPdfList.length - 1
                        }
                        className="bg-gray-600 px-4 py-1 rounded disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>

                    {/* Área del Visor con Scroll */}
                    <div
                      ref={visorContainerRef}
                      className="flex-grow w-full overflow-auto bg-gray-500"
                      style={{ cursor: getVisorCursor() }}
                      onClick={handleClickToPlace}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      {activeIndex !== null && pdfList[activeIndex] ? (
                        <div className="relative mx-auto my-auto w-fit h-fit">
                          <canvas ref={canvasRef} className="shadow-lg" />
                          <div
                            className="absolute top-0 left-0 pointer-events-none"
                            style={{
                              width: canvasDimensions.width,
                              height: canvasDimensions.height,
                            }}
                          >
                            {getAnnotations()
                              .filter(
                                (a) =>
                                  a.position && a.position.page === currentPage
                              )
                              .map((anno) => (
                                <Annotation
                                  key={anno.id}
                                  {...anno}
                                  onDragStart={handleDragStart}
                                  isDragging={dragging?.id === anno.id}
                                  zoom={zoom}
                                />
                              ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-lg">Cargue un PDF para comenzar</p>
                        </div>
                      )}
                    </div>

                    {/* Controles Inferiores */}
                    <div className="flex justify-center items-center space-x-8 mt-2 flex-none">
                      <div className="w-full flex justify-center items-center space-x-8 mt-2 text-white">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              setCurrentPage((p) => Math.max(1, p - 1))
                            }
                            disabled={currentPage === 1}
                          >
                            {"<"}
                          </button>
                          <span>
                            Página {currentPage} de{" "}
                            {pdfList[activeIndex]?.doc?.numPages || 0}
                          </span>
                          <button
                            onClick={() =>
                              setCurrentPage((p) =>
                                Math.min(
                                  pdfList[activeIndex]?.doc?.numPages || 1,
                                  p + 1
                                )
                              )
                            }
                            disabled={
                              currentPage ===
                              pdfList[activeIndex]?.doc?.numPages
                            }
                          >
                            {">"}
                          </button>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              setZoom((z) => Math.max(0.25, z - 0.25))
                            }
                          >
                            -
                          </button>
                          <span>{(zoom * 100).toFixed(0)}%</span>
                          <button
                            onClick={() =>
                              setZoom((z) => Math.min(4, z + 0.25))
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="h-1.5 bg-gray-300 hover:bg-blue-500 transition-colors flex-none" />
                <Panel defaultSize={25} minSize={10}>
                  <XmlPanel
                    initialData={gridData}
                    onGridDataChange={handleGridDataChange}
                    onSave={handleSaveGridData}
                    onRefresh={handleRefreshGridData}
                    onOpenLookup={openLookupModal}
                  />
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-gray-300 hover:bg-blue-500 transition-colors flex-none" />

          {/* ================= PANEL DERECHO ================= */}
          <Panel defaultSize={25} minSize={20}>
            <div className="h-full bg-white shadow-lg overflow-y-auto">
              <DataPanel
                formData={activeFormData}
                onFormChange={handleFormChange}
                onAddRetention={handleAddRetention}
                onRemoveRetention={handleRemoveRetention}
                onRetentionChange={handleRetentionChange}
                onFieldFocus={handleFieldFocus}
                activeFieldId={activeFieldId}
                onSave={handleSavePdf}
                onClearFocus={handleClearFocus}
                onSaveTemplate={handleSaveTemplate}
                onLoadTemplate={handleLoadTemplate}
                onProcessDataToXml={handleProcessDataToXml}
                onOpenRetentionLookup={openRetentionLookupModal}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
      <Toast message={toastMessage} onDone={() => setToastMessage("")} />
      <LookupModal
        isOpen={modalState.isOpen}
        title={`Seleccionar ${modalState.catalogType}`}
        data={
          modalState.catalogType === "PUC"
            ? pucData
            : modalState.catalogType === "Centro de Costos"
            ? costCenterData
            : modalState.catalogType === "Concepto de Retención"
            ? retentionConceptData
            : []
        }
        onSelect={handleModalSelect}
        onClose={handleModalClose}
      />
    </div>
  );
}

export default App;
