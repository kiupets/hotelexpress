const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const moment = require('moment');
const Reservation = require('../models/Reservation');
const calcularOcupacionMensual = require('../utils/occupancyCalculator')
const Ganancias = require('../models/Ganancias');



// Endpoint para exportar el reporte de ganancias
router.post('/export-ganancias', async (req, res) => {
    try {
        const { ingresos, gastosOrdinarios, gastosExtraordinarios, selectedMonth, selectedYear, userId, cajaAnterior } = req.body;

        // Inicializar el workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema de Ganancias';
        workbook.lastModifiedBy = 'Sistema de Ganancias';
        workbook.created = new Date();
        workbook.modified = new Date();

        // Calcular estadísticas de ocupación
        const estadisticasOcupacion = await calcularOcupacionMensual(selectedMonth || moment().format('MM'), selectedYear);

        // Calcular totales
        const totalIngresos = ingresos.reduce((sum, item) => sum + item.monto, 0);
        const totalGastosOrd = gastosOrdinarios.reduce((sum, item) => sum + item.monto, 0);
        const totalGastosExt = gastosExtraordinarios.reduce((sum, item) => sum + item.monto, 0);

        // Obtener categorías únicas
        const tiposGasto = [...new Set(gastosOrdinarios.map(g => g.tipo))].sort();
        const categorias = [...new Set(gastosExtraordinarios.map(g => g.categoria))].sort();

        // Ordenar los tipos de gasto en el orden deseado
        const tiposGastoOrdenados = [
            'SERVICIOS',
            'SUELDOS',
            'PRESENTISMO',
            'PREMIOS',
            'HORAS_EXTRAS',
            'INSUMOS_DESAYUNO',
            'INSUMOS_LIMPIEZA',
            'MANTENIMIENTO',
            'OTROS'
        ];

        // Hoja 1: Resumen Financiero
        const resumenSheet = workbook.addWorksheet('Resumen Financiero');
        resumenSheet.columns = [
            { header: 'Categoría', key: 'categoria', width: 25 },
            { header: 'Subcategoría', key: 'subcategoria', width: 20 },
            { header: 'Monto', key: 'monto', width: 15 },
            { header: 'Porcentaje', key: 'porcentaje', width: 15 }
        ];

        // Datos para el resumen
        const datosResumen = [
            // === INGRESOS ===
            ...ingresos.map(item => ({
                categoria: 'INGRESOS',
                subcategoria: item.subcategoria,
                monto: item.monto,
                porcentaje: ((item.monto / totalIngresos) * 100).toFixed(2)
            })),
            { categoria: 'INGRESOS', subcategoria: 'Total', monto: totalIngresos, porcentaje: '100.00' },
            { categoria: '', subcategoria: '', monto: null, porcentaje: null },

            // === GASTOS ORDINARIOS ===
            { categoria: 'GASTOS ORDINARIOS', subcategoria: '', monto: null, porcentaje: null },
            ...tiposGastoOrdenados.map(tipo => {
                const gastosDelTipo = gastosOrdinarios.filter(g => g.tipo === tipo);
                const subtotal = gastosDelTipo.reduce((sum, g) => sum + g.monto, 0);
                return {
                    categoria: '',
                    subcategoria: tipo,
                    monto: subtotal,
                    porcentaje: ((subtotal / totalGastosOrd) * 100).toFixed(2)
                };
            }),
            { categoria: 'GASTOS ORDINARIOS', subcategoria: 'Total', monto: totalGastosOrd, porcentaje: ((totalGastosOrd / totalIngresos) * 100).toFixed(2) },
            { categoria: '', subcategoria: '', monto: null, porcentaje: null },

            // === GASTOS EXTRAORDINARIOS ===
            { categoria: 'GASTOS EXTRAORDINARIOS', subcategoria: '', monto: null, porcentaje: null },
            ...categorias.map(categoria => {
                const gastosDeCategoria = gastosExtraordinarios.filter(g => g.categoria === categoria);
                const subtotal = gastosDeCategoria.reduce((sum, g) => sum + g.monto, 0);
                return {
                    categoria: '',
                    subcategoria: categoria,
                    monto: subtotal,
                    porcentaje: ((subtotal / totalGastosExt) * 100).toFixed(2)
                };
            }),
            { categoria: 'GASTOS EXTRAORDINARIOS', subcategoria: 'Total', monto: totalGastosExt, porcentaje: ((totalGastosExt / totalIngresos) * 100).toFixed(2) },
            { categoria: '', subcategoria: '', monto: null, porcentaje: null },

            // === OCUPACIÓN ===
            { categoria: `OCUPACIÓN ${moment(selectedMonth, 'MM').format('MMMM').toUpperCase()} ${selectedYear}`, subcategoria: '', monto: null, porcentaje: null },
            { categoria: '', subcategoria: 'Porcentaje Ocupación', monto: null, porcentaje: estadisticasOcupacion.porcentajeOcupacion },
            { categoria: '', subcategoria: 'Días Ocupados', monto: estadisticasOcupacion.diasOcupados, porcentaje: null },
            { categoria: '', subcategoria: 'Promedio Diario', monto: estadisticasOcupacion.promedioOcupacionDiaria, porcentaje: null },
            { categoria: '', subcategoria: '', monto: null, porcentaje: null },

            // === RESULTADO NETO ===
            {
                categoria: 'RESULTADO',
                subcategoria: 'NETO',
                monto: totalIngresos - totalGastosOrd - totalGastosExt,
                porcentaje: (((totalIngresos - totalGastosOrd - totalGastosExt) / totalIngresos) * 100).toFixed(2)
            }
        ];

        // Agregar datos al resumen
        datosResumen.forEach((item, index) => {
            const row = resumenSheet.addRow(item);

            // Estilos especiales para títulos y totales
            if (item.categoria && !item.subcategoria) {
                row.font = { bold: true };
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE3F2FD' }
                };
            }

            // Estilos para totales
            if (item.subcategoria && item.subcategoria.includes('Total')) {
                row.font = { bold: true };
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE8EAF6' }
                };
            }

            // Estilo especial para resultado neto
            if (item.categoria === 'RESULTADO') {
                row.font = { bold: true, size: 12 };
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: item.monto >= 0 ? 'FF4CAF50' : 'FFEF5350' }
                };
            }
        });

        // Hoja 2: Gastos Ordinarios
        const gastosSheet = workbook.addWorksheet('Gastos Ordinarios');
        gastosSheet.columns = [
            { header: 'Tipo', key: 'tipo', width: 20 },
            { header: 'Concepto', key: 'concepto', width: 40 },
            { header: 'Fecha', key: 'fecha', width: 15 },
            { header: 'Turno', key: 'turno', width: 15 },
            { header: 'Horas', key: 'horas', width: 10 },
            { header: 'Valor Hora', key: 'valorHora', width: 15 },
            { header: 'Monto', key: 'monto', width: 15 },
            { header: 'Método de Pago', key: 'metodoPago', width: 15 }
        ];

        // Agregar gastos ordinarios agrupados por tipo
        tiposGastoOrdenados.forEach(tipo => {
            const headerRow = gastosSheet.addRow([tipo, '', '', '', '', '', '', '']);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE3F2FD' }
            };

            const gastosDelTipo = gastosOrdinarios.filter(g => g.tipo === tipo);
            gastosDelTipo.forEach(gasto => {
                const row = {
                    tipo: gasto.tipo,
                    concepto: gasto.concepto,
                    fecha: gasto.tipo === 'HORAS_EXTRAS' ? moment(gasto.fecha).format('DD/MM/YYYY') : '',
                    turno: gasto.tipo === 'HORAS_EXTRAS' ? gasto.turno : '',
                    horas: gasto.tipo === 'HORAS_EXTRAS' ? gasto.cantidadHoras : '',
                    valorHora: gasto.tipo === 'HORAS_EXTRAS' ? gasto.valorHora : '',
                    monto: gasto.monto,
                    metodoPago: gasto.metodoPago
                };
                gastosSheet.addRow(row);
            });

            const subtotal = gastosDelTipo.reduce((sum, g) => sum + g.monto, 0);
            const subtotalRow = gastosSheet.addRow({
                tipo: `Subtotal ${tipo}`,
                concepto: '',
                fecha: '',
                turno: '',
                horas: '',
                valorHora: '',
                monto: subtotal,
                metodoPago: ''
            });
            subtotalRow.font = { bold: true };
            subtotalRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8EAF6' }
            };

            gastosSheet.addRow({});
        });

        // Aplicar formato a las columnas numéricas
        gastosSheet.getColumn('monto').numFmt = '"$"#,##0.00';
        gastosSheet.getColumn('valorHora').numFmt = '"$"#,##0.00';

        const totalRowOrd = gastosSheet.addRow({
            tipo: 'TOTAL GENERAL',
            concepto: '',
            monto: totalGastosOrd
        });
        totalRowOrd.font = { bold: true };
        totalRowOrd.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD1C4E9' }
        };

        // Hoja 3: Gastos Extraordinarios
        const gastosExtraSheet = workbook.addWorksheet('Gastos Extraordinarios');
        gastosExtraSheet.columns = [
            { header: 'Concepto', key: 'concepto', width: 30 },
            { header: 'Categoría', key: 'categoria', width: 20 },
            { header: 'Monto', key: 'monto', width: 15 }
        ];

        categorias.forEach(categoria => {
            const headerRow = gastosExtraSheet.addRow(['', categoria, '']);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE3F2FD' }
            };

            const gastosDeCategoria = gastosExtraordinarios.filter(g => g.categoria === categoria);
            gastosDeCategoria.forEach(gasto => {
                gastosExtraSheet.addRow(gasto);
            });

            const subtotal = gastosDeCategoria.reduce((sum, g) => sum + g.monto, 0);
            const subtotalRow = gastosExtraSheet.addRow({
                concepto: `Subtotal ${categoria}`,
                categoria: '',
                monto: subtotal
            });
            subtotalRow.font = { bold: true };
            subtotalRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8EAF6' }
            };

            gastosExtraSheet.addRow({});
        });

        const totalRowExt = gastosExtraSheet.addRow({
            concepto: 'TOTAL GENERAL',
            categoria: '',
            monto: totalGastosExt
        });
        totalRowExt.font = { bold: true };
        totalRowExt.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD1C4E9' }
        };

        // Hoja 4: Caja
        const cajaSheet = workbook.addWorksheet('Caja');
        cajaSheet.columns = [
            { header: 'Concepto', key: 'concepto', width: 30 },
            { header: 'Monto', key: 'monto', width: 20 }
        ];

        // Calcular valores de caja
        const ingresosEfectivo = ingresos
            .filter(i => i.subcategoria === 'Efectivo')
            .reduce((sum, i) => sum + (i.monto || 0), 0);

        const gastosOrdinariosEfectivo = gastosOrdinarios
            .filter(g => g.metodoPago === 'EFECTIVO')
            .reduce((sum, g) => sum + (g.monto || 0), 0);

        const saldoFinal = Number(cajaAnterior) + ingresosEfectivo - gastosOrdinariosEfectivo;

        const filasCaja = [
            { concepto: 'Caja del mes anterior', monto: Number(cajaAnterior) },
            { concepto: 'Ingresos en Efectivo', monto: ingresosEfectivo },
            { concepto: 'Gastos Ordinarios en Efectivo', monto: gastosOrdinariosEfectivo },
            { concepto: '', monto: null },
            { concepto: 'Saldo Final de Caja', monto: saldoFinal }
        ];

        // Agregar filas y aplicar estilos
        filasCaja.forEach((fila, index) => {
            const row = cajaSheet.addRow(fila);

            // Estilo para el saldo final
            if (index === filasCaja.length - 1) {
                row.font = { bold: true };
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD1C4E9' }
                };
            }
        });

        // Formato de moneda para la columna de monto
        cajaSheet.getColumn('monto').numFmt = '"$"#,##0.00';

        // Agregar detalles de gastos en efectivo
        cajaSheet.addRow({});
        cajaSheet.addRow({ concepto: 'Detalle de Gastos en Efectivo' });
        cajaSheet.addRow({});

        gastosOrdinarios
            .filter(g => g.metodoPago === 'EFECTIVO')
            .forEach(gasto => {
                cajaSheet.addRow({
                    concepto: `${gasto.tipo} - ${gasto.concepto}`,
                    monto: gasto.monto
                });
            });

        // Aplicar estilos comunes a todas las hojas
        [resumenSheet, gastosSheet, gastosExtraSheet, cajaSheet].forEach(sheet => {
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4167B1' }
            };

            sheet.columns.forEach(column => {
                if (column.key === 'monto') {
                    column.numFmt = '"$"#,##0.00';
                }
                if (column.key === 'porcentaje') {
                    column.numFmt = '0.00"%"';
                }
            });

            // Aplicar formato especial a las filas de ocupación
            if (sheet === resumenSheet) {
                sheet.eachRow((row, rowNumber) => {
                    const subcategoria = row.getCell('subcategoria').value;
                    if (subcategoria === 'Días Ocupados' || subcategoria === 'Promedio Diario') {
                        row.getCell('monto').numFmt = '#,##0.00';
                    }
                });
            }

            sheet.eachRow({ includeEmpty: false }, row => {
                row.eachCell({ includeEmpty: false }, cell => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });
        });

        // Generar el archivo
        const buffer = await workbook.xlsx.writeBuffer();

        // Configurar headers de respuesta
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=reporte-ganancias-${moment().format('YYYYMMDD')}.xlsx`,
            'Content-Length': buffer.length
        });

        // Enviar el archivo
        res.send(buffer);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            message: "Error generando Excel",
            error: error.message
        });
    }
});

module.exports = router;