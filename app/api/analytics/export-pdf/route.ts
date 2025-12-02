import { NextResponse } from "next/server"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// Adiciona suporte a UTF-8
import 'jspdf-autotable'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { insights, mlAnalysis, period } = body

        console.log("[PDF Export] Gerando relatório PDF...")

        const doc = new jsPDF()

        // Configura fonte para suportar UTF-8
        doc.setFont("helvetica")

        let yPosition = 20

        // Header
        doc.setFontSize(24)
        doc.setTextColor(0, 255, 136)
        doc.text("GerencIA - Relatorio de Analise ML", 20, yPosition)

        yPosition += 10
        doc.setFontSize(10)
        doc.setTextColor(150, 150, 150)
        const periodLabel = period === 'day' ? 'Diario' : period === 'week' ? 'Semanal' : period === '2weeks' ? 'Quinzenal' : 'Mensal'
        doc.text(`Periodo: ${periodLabel} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, 20, yPosition)

        yPosition += 15
        doc.setDrawColor(0, 255, 136)
        doc.line(20, yPosition, 190, yPosition)
        yPosition += 10

        // Métricas Principais
        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Metricas Principais", 20, yPosition)
        yPosition += 10

        const metricsData = [
            ['Total de Conversas', insights.totalConversations.toString()],
            ['Taxa de Conversao', `${insights.conversionRate.toFixed(1)}%`],
            ['Msgs para Converter', insights.avgMessagesToConvert.toFixed(1)],
            ['Tempo para Converter', `${insights.avgTimeToConvert.toFixed(0)} min`]
        ]

        autoTable(doc, {
            startY: yPosition,
            head: [['Metrica', 'Valor']],
            body: metricsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 10, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Top Contatos que Mais Interagiram
        if (yPosition > 220) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Top 10 Contatos que Mais Interagiram", 20, yPosition)
        yPosition += 10

        const contactsData = insights.topContacts.slice(0, 10).map((contact: any) => [
            contact.contactName,
            contact.numero.substring(contact.numero.length - 4),
            contact.totalMessages.toString(),
            contact.totalConversations.toString(),
            contact.conversionStatus === 'converted' ? 'Convertido' : contact.conversionStatus === 'in_progress' ? 'Em Progresso' : 'Perdido'
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Nome', 'Numero', 'Msgs', 'Conversas', 'Status']],
            body: contactsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 9, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Análise de Objeções
        if (yPosition > 200) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Analise de Objecoes", 20, yPosition)
        yPosition += 10

        const objectionsData = insights.objectionAnalysis.map((obj: any) => [
            obj.objection,
            obj.frequency.toString(),
            obj.successfulHandling.toString(),
            `${obj.successRate.toFixed(1)}%`
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Objecao', 'Frequencia', 'Sucesso', 'Taxa']],
            body: objectionsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 9, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Motivos de Não Agendamento
        if (yPosition > 200) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Motivos de Nao Agendamento", 20, yPosition)
        yPosition += 10

        const reasonsData = insights.nonSchedulingReasons.map((reason: any) => [
            reason.reason,
            reason.frequency.toString(),
            `${((reason.frequency / insights.totalConversations) * 100).toFixed(1)}%`
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Motivo', 'Frequencia', 'Percentual']],
            body: reasonsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 9, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Análise de Sentimento
        if (yPosition > 220) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Analise de Sentimento", 20, yPosition)
        yPosition += 10

        const sentimentTotal = insights.sentimentAnalysis.positive + insights.sentimentAnalysis.neutral + insights.sentimentAnalysis.negative
        const sentimentData = [
            ['Positivo', insights.sentimentAnalysis.positive.toString(), `${((insights.sentimentAnalysis.positive / sentimentTotal) * 100).toFixed(1)}%`],
            ['Neutro', insights.sentimentAnalysis.neutral.toString(), `${((insights.sentimentAnalysis.neutral / sentimentTotal) * 100).toFixed(1)}%`],
            ['Negativo', insights.sentimentAnalysis.negative.toString(), `${((insights.sentimentAnalysis.negative / sentimentTotal) * 100).toFixed(1)}%`]
        ]

        autoTable(doc, {
            startY: yPosition,
            head: [['Sentimento', 'Quantidade', 'Percentual']],
            body: sentimentData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Padrões de Conversão
        if (yPosition > 200) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Top 3 Padroes de Conversao", 20, yPosition)
        yPosition += 10

        const patternsData = insights.conversionPatterns.slice(0, 3).map((p: any) => [
            p.pattern,
            p.frequency.toString(),
            `${p.successRate.toFixed(1)}%`,
            p.avgMessagesToConvert.toFixed(1),
            p.objectionHandling.join(', ').substring(0, 30)
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Padrao', 'Freq', 'Taxa', 'Msgs', 'Objecoes']],
            body: patternsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 8, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Melhores Horários
        if (yPosition > 220) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Melhores Horarios para Conversao", 20, yPosition)
        yPosition += 10

        const hoursData = insights.bestPerformingHours.slice(0, 5).map((h: any) => [
            `${h.hour}h - ${h.hour + 1}h`,
            h.conversions.toString()
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Horario', 'Conversoes']],
            body: hoursData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Top Keywords
        if (yPosition > 200) {
            doc.addPage()
            yPosition = 20
        }

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Top 10 Keywords", 20, yPosition)
        yPosition += 10

        const keywordsData = insights.topKeywords.slice(0, 10).map((kw: any) => [
            kw.keyword,
            kw.frequency.toString(),
            `${kw.conversionRate.toFixed(1)}%`
        ])

        autoTable(doc, {
            startY: yPosition,
            head: [['Keyword', 'Frequencia', 'Taxa Conversao']],
            body: keywordsData,
            theme: 'grid',
            headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
            styles: { fontSize: 9, font: 'helvetica' }
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Segmentação ML (se disponível)
        if (mlAnalysis && mlAnalysis.segments) {
            doc.addPage()
            yPosition = 20

            doc.setFontSize(16)
            doc.setTextColor(255, 255, 255)
            doc.text("Segmentacao de Leads (K-means)", 20, yPosition)
            yPosition += 10

            const segmentsData = mlAnalysis.segments.map((seg: any) => [
                seg.segment,
                seg.leads.length.toString(),
                `${seg.characteristics.conversionRate}%`,
                seg.characteristics.avgMessages.toString()
            ])

            autoTable(doc, {
                startY: yPosition,
                head: [['Segmento', 'Leads', 'Conv. Rate', 'Msgs Media']],
                body: segmentsData,
                theme: 'grid',
                headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
                styles: { font: 'helvetica' }
            })

            yPosition = (doc as any).lastAutoTable.finalY + 15
        }

        // Predições (se disponível)
        if (mlAnalysis && mlAnalysis.predictions) {
            if (yPosition > 200) {
                doc.addPage()
                yPosition = 20
            }

            doc.setFontSize(16)
            doc.setTextColor(255, 255, 255)
            doc.text("Top 10 Predicoes de Conversao", 20, yPosition)
            yPosition += 10

            const predictionsData = mlAnalysis.predictions.slice(0, 10).map((pred: any) => [
                pred.numero.substring(pred.numero.length - 4),
                `${pred.conversionProbability}%`,
                pred.confidence
            ])

            autoTable(doc, {
                startY: yPosition,
                head: [['Lead', 'Probabilidade', 'Confianca']],
                body: predictionsData,
                theme: 'grid',
                headStyles: { fillColor: [0, 255, 136], textColor: [0, 0, 0], fontStyle: 'bold' },
                styles: { font: 'helvetica' }
            })

            yPosition = (doc as any).lastAutoTable.finalY + 15
        }

        // Recomendações
        doc.addPage()
        yPosition = 20

        doc.setFontSize(16)
        doc.setTextColor(255, 255, 255)
        doc.text("Recomendacoes Inteligentes", 20, yPosition)
        yPosition += 15

        doc.setFontSize(10)
        doc.setTextColor(200, 200, 200)

        insights.recommendations.forEach((rec: string, idx: number) => {
            if (yPosition > 270) {
                doc.addPage()
                yPosition = 20
            }

            // Remove emojis para evitar problemas de encoding
            const cleanRec = rec.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            const lines = doc.splitTextToSize(`${idx + 1}. ${cleanRec}`, 170)
            doc.text(lines, 20, yPosition)
            yPosition += lines.length * 7 + 5
        })

        // Insights Semânticos GPT (se disponível)
        if (mlAnalysis && mlAnalysis.semanticInsights) {
            doc.addPage()
            yPosition = 20

            doc.setFontSize(16)
            doc.setTextColor(255, 255, 255)
            doc.text("Analise Semantica GPT", 20, yPosition)
            yPosition += 15

            doc.setFontSize(9)
            doc.setTextColor(200, 200, 200)

            mlAnalysis.semanticInsights.forEach((insight: string) => {
                if (yPosition > 270) {
                    doc.addPage()
                    yPosition = 20
                }

                const lines = doc.splitTextToSize(insight, 170)
                doc.text(lines, 20, yPosition)
                yPosition += lines.length * 5 + 5
            })
        }

        // Footer em todas as páginas
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            doc.setFontSize(8)
            doc.setTextColor(100, 100, 100)
            doc.text(
                `Pagina ${i} de ${pageCount} | GerencIA (c) ${new Date().getFullYear()}`,
                105,
                290,
                { align: 'center' }
            )
        }

        // Gera PDF como buffer
        const pdfBuffer = doc.output('arraybuffer')

        console.log("[PDF Export] PDF gerado com sucesso")

        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="relatorio-gerencia-${periodLabel}-${Date.now()}.pdf"`
            }
        })

    } catch (error: any) {
        console.error("[PDF Export] Erro:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
