import { type NextRequest, NextResponse } from "next/server"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const relatorio = payload?.relatorio ?? payload?.dados ?? payload

    if (!relatorio?.metricas) {
      return NextResponse.json({ error: "Payload inválido para geração de PDF" }, { status: 400 })
    }

    const periodo = String(relatorio.periodo || payload?.periodo || "Relatório")
    const metricas = relatorio.metricas
    const porDia = Array.isArray(relatorio.porDia) ? relatorio.porDia : []

    const formatarNumero = (num: number) => {
      return new Intl.NumberFormat("pt-BR").format(num)
    }

    const formatarData = (data: string) => {
      return format(new Date(data), "dd/MM/yyyy", { locale: ptBR })
    }

    const metrics = [
      { label: "Total de Conversas", value: metricas.totalConversas },
      { label: "Leads únicos", value: metricas.totalLeads },
      { label: "Agendamentos", value: metricas.totalAgendamentos },
      { label: "Taxa de conversão", value: `${metricas.taxaAgendamento.toFixed(1)}%` },
      { label: "Follow-ups enviados", value: metricas.followUpsEnviados },
      { label: "Lead time médio", value: `${metricas.leadTimeHoras}h` },
      { label: "Conversas ativas", value: metricas.conversasAtivas },
      { label: "Conversas finalizadas", value: metricas.conversasFinalizadas },
    ]

    // Gerar HTML estruturado para PDF
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatório ${periodo}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background: #fff;
                font-size: 12px;
            }
            .container { max-width: 900px; margin: 0 auto; padding: 20px; }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 3px solid #10b981;
                padding-bottom: 20px;
            }
            .header h1 {
                color: #1f2937;
                font-size: 26px;
                margin-bottom: 10px;
                font-weight: 700;
            }
            .header p {
                color: #6b7280;
                font-size: 13px;
                font-weight: 500;
            }
            .metrics {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
                margin-bottom: 30px;
            }
            .metric-card {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 16px;
                text-align: center;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .metric-card h3 {
                color: #6b7280;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
                font-weight: 600;
            }
            .metric-card .value {
                color: #1f2937;
                font-size: 20px;
                font-weight: 700;
            }
            .section {
                margin-bottom: 30px;
            }
            .section h2 {
                color: #1f2937;
                font-size: 16px;
                margin-bottom: 12px;
                border-left: 4px solid #10b981;
                padding-left: 12px;
                font-weight: 600;
            }
            .table {
                width: 100%;
                border-collapse: collapse;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
            }
            .table th {
                background: #f3f4f6;
                color: #374151;
                padding: 10px;
                text-align: left;
                font-weight: 600;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .table td {
                padding: 10px;
                border-top: 1px solid #e5e7eb;
                font-size: 11px;
            }
            .table tr:nth-child(even) {
                background: #f9fafb;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                color: #6b7280;
                font-size: 10px;
                border-top: 1px solid #e5e7eb;
                padding-top: 20px;
            }
            @media print {
                body { font-size: 11px; }
                .container { padding: 15px; }
                .header h1 { font-size: 24px; }
                .metric-card .value { font-size: 18px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Relatório de Performance - ${periodo}</h1>
                <p>Período: ${formatarData(relatorio.dataInicio)} até ${formatarData(relatorio.dataFim)}</p>
                <p>Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>

            <div class="metrics">
                ${metrics
                  .map(
                    (metric) => `
                <div class="metric-card">
                    <h3>${metric.label}</h3>
                    <div class="value">${typeof metric.value === "number" ? formatarNumero(metric.value) : metric.value}</div>
                </div>
                `,
                  )
                  .join("")}
            </div>

            <div class="section">
                <h2>Consolidado por dia</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Conversas</th>
                            <th>Agendamentos</th>
                            <th>Follow-ups</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${porDia
                          .map(
                            (item: any) => `
                            <tr>
                                <td>${formatarData(item.data)}</td>
                                <td>${formatarNumero(item.conversas || 0)}</td>
                                <td>${formatarNumero(item.agendamentos || 0)}</td>
                                <td>${formatarNumero(item.followups || 0)}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="footer">
                <p>Relatório gerado automaticamente pelo Sistema de Gestão WhatsApp AI</p>
                <p>© ${new Date().getFullYear()} Genial Labs - Todos os direitos reservados</p>
            </div>
        </div>
    </body>
    </html>
    `

    // Simular geração de PDF (em produção, usar biblioteca como Puppeteer)
    const pdfBuffer = Buffer.from(htmlContent, "utf-8")
    const safePeriodo = periodo
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${safePeriodo || "periodo"}-${format(
          new Date(),
          "yyyy-MM-dd",
        )}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Erro ao gerar PDF:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
