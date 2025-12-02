import { type NextRequest, NextResponse } from "next/server"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export async function POST(request: NextRequest) {
  try {
    const { dados, periodo } = await request.json()

    const formatarNumero = (num: number) => {
      return new Intl.NumberFormat("pt-BR").format(num)
    }

    const formatarData = (data: string) => {
      return format(new Date(data), "dd/MM/yyyy", { locale: ptBR })
    }

    // Gerar HTML estruturado para PDF
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatório ${dados.periodo}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                background: #fff;
                font-size: 12px;
            }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { 
                text-align: center; 
                margin-bottom: 30px; 
                border-bottom: 3px solid #10b981; 
                padding-bottom: 20px; 
            }
            .header h1 { 
                color: #1f2937; 
                font-size: 28px; 
                margin-bottom: 10px; 
                font-weight: 700;
            }
            .header p { 
                color: #6b7280; 
                font-size: 14px; 
                font-weight: 500;
            }
            .metrics { 
                display: grid; 
                grid-template-columns: repeat(2, 1fr); 
                gap: 20px; 
                margin-bottom: 30px; 
            }
            .metric-card { 
                background: #f9fafb; 
                border: 1px solid #e5e7eb; 
                border-radius: 8px; 
                padding: 20px; 
                text-align: center;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .metric-card h3 { 
                color: #6b7280; 
                font-size: 12px; 
                text-transform: uppercase; 
                letter-spacing: 0.5px; 
                margin-bottom: 8px; 
                font-weight: 600;
            }
            .metric-card .value { 
                color: #1f2937; 
                font-size: 24px; 
                font-weight: 700; 
            }
            .section { 
                margin-bottom: 30px; 
            }
            .section h2 { 
                color: #1f2937; 
                font-size: 18px; 
                margin-bottom: 15px; 
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
                padding: 12px; 
                text-align: left; 
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .table td { 
                padding: 12px; 
                border-top: 1px solid #e5e7eb; 
                font-size: 12px;
            }
            .table tr:nth-child(even) { 
                background: #f9fafb; 
            }
            .badge { 
                background: #dcfce7; 
                color: #166534; 
                padding: 4px 8px; 
                border-radius: 4px; 
                font-size: 10px; 
                font-weight: 600;
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
                .metric-card .value { font-size: 20px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Relatório de Conversas - ${dados.periodo}</h1>
                <p>Período: ${formatarData(dados.dataInicio)} até ${formatarData(dados.dataFim)}</p>
                <p>Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>

            <div class="metrics">
                <div class="metric-card">
                    <h3>Total de Conversas</h3>
                    <div class="value">${formatarNumero(dados.totalConversas)}</div>
                </div>
                <div class="metric-card">
                    <h3>Total de Mensagens</h3>
                    <div class="value">${formatarNumero(dados.totalMensagens)}</div>
                </div>
                <div class="metric-card">
                    <h3>Agendamentos</h3>
                    <div class="value">${formatarNumero(dados.totalAgendamentos)}</div>
                </div>
                <div class="metric-card">
                    <h3>Follow-ups</h3>
                    <div class="value">${formatarNumero(dados.totalFollowups)}</div>
                </div>
            </div>

            <div class="section">
                <h2>Top 10 Conversas</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Posição</th>
                            <th>Número</th>
                            <th>Nome</th>
                            <th>Mensagens</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dados.topNumeros
                          .slice(0, 10)
                          .map(
                            (item: any, index: number) => `
                            <tr>
                                <td><span class="badge">#${index + 1}</span></td>
                                <td>${item.numero}</td>
                                <td>${item.nome || "Sem nome"}</td>
                                <td>${formatarNumero(item.mensagens)}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>Conversas por Dia</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Quantidade de Conversas</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dados.conversasPorDia
                          .map(
                            (item: any) => `
                            <tr>
                                <td>${formatarData(item.data)}</td>
                                <td>${formatarNumero(item.quantidade)}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            ${
              dados.agendamentosPorDia.length > 0
                ? `
            <div class="section">
                <h2>Agendamentos por Dia</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Quantidade de Agendamentos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dados.agendamentosPorDia
                          .map(
                            (item: any) => `
                            <tr>
                                <td>${formatarData(item.data)}</td>
                                <td>${formatarNumero(item.quantidade)}</td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
            `
                : ""
            }

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

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${periodo}-${format(new Date(), "yyyy-MM-dd")}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Erro ao gerar PDF:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
