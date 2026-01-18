"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect } from "react"

interface OverviewChartProps {
    data: any[]
}

export function OverviewChart({ data }: OverviewChartProps) {
    // Validação mais permissiva - aceita dados mesmo se alguns campos estiverem faltando
    useEffect(() => {
        console.log('[OverviewChart] Dados recebidos:', data)
    }, [data])

    if (!data || !Array.isArray(data)) {
        return (
            <Card className="genial-card col-span-4">
                <CardHeader>
                    <CardTitle className="text-pure-white">Volume de Leads por Dia</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <p className="text-text-gray">Carregando dados do gráfico...</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Processar dados - garantir que todos têm o formato correto
    const validData = data
        .map(item => {
            // Se o item não existe ou não é objeto, pular
            if (!item || typeof item !== 'object') return null

            // Garantir que formattedDate existe (pode estar em diferentes formatos)
            let formattedDate = item.formattedDate || item.date || ''
            if (item.date && !item.formattedDate) {
                // Tentar formatar se só tiver a data ISO
                try {
                    const [year, month, day] = item.date.split('-')
                    formattedDate = `${day}/${month}`
                } catch {
                    formattedDate = String(item.date).substring(5, 10).replace('-', '/')
                }
            }

            const total = Number(item.total) || 0
            const success = Number(item.success) || 0
            const error = Number(item.error) || 0

            return {
                formattedDate: formattedDate,
                total: total,
                success: success,
                error: error
            }
        })
        .filter(item => {
            // Manter apenas itens com data válida E pelo menos um valor maior que zero
            return item && item.formattedDate && (item.total > 0 || item.success > 0 || item.error > 0)
        })

    console.log('[OverviewChart] Dados válidos processados:', validData.length, 'itens')
    if (validData.length > 0) {
        console.log('[OverviewChart] Primeiros 3 itens:', validData.slice(0, 3))
        console.log('[OverviewChart] Totais:', {
            total: validData.reduce((sum, item) => sum + item.total, 0),
            success: validData.reduce((sum, item) => sum + item.success, 0)
        })
    }

    if (validData.length === 0) {
        return (
            <Card className="genial-card col-span-4">
                <CardHeader>
                    <CardTitle className="text-pure-white">Volume de Leads por Dia</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <p className="text-text-gray">Nenhum dado disponível para exibir</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    // Garantir que há dados válidos
    console.log('[OverviewChart] Renderizando com', validData.length, 'pontos de dados')
    console.log('[OverviewChart] Dados:', validData.slice(0, 3))

    return (
        <Card className="genial-card col-span-4">
            <CardHeader>
                <CardTitle className="text-pure-white">Volume de Leads por Dia</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={validData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FFD700" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#FFD700" stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FFA500" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#FFA500" stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis
                                dataKey="formattedDate"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                                domain={[0, 'auto']}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "#111",
                                    border: "1px solid #333",
                                    borderRadius: "8px",
                                    color: "#fff",
                                }}
                                itemStyle={{ color: "#fff" }}
                                cursor={{ stroke: "#FFD700", strokeWidth: 2, strokeDasharray: "5 5" }}
                            />
                            <Area
                                type="monotone"
                                dataKey="success"
                                name="Leads"
                                stroke="#FFD700"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                                dot={{ fill: "#FFD700", r: 5, strokeWidth: 2, stroke: "#fff" }}
                                activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2 }}
                                connectNulls={true}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
