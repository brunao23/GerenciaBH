"use client"

import { memo, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface OverviewChartProps {
    data: any[]
}

type ChartPoint = {
    formattedDate: string
    total: number
    success: number
    error: number
}

function ChartEmptyState({ message }: { message: string }) {
    return (
        <Card className="genial-card col-span-4">
            <CardHeader>
                <CardTitle className="text-pure-white">Volume de Leads por Dia</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="flex h-[300px] w-full items-center justify-center">
                    <p className="text-text-gray">{message}</p>
                </div>
            </CardContent>
        </Card>
    )
}

export const OverviewChart = memo(function OverviewChart({ data }: OverviewChartProps) {
    const validData = useMemo<ChartPoint[]>(() => {
        if (!data || !Array.isArray(data)) return []

        return data
            .map((item) => {
                if (!item || typeof item !== "object") return null

                let formattedDate = item.formattedDate || item.date || ""
                if (item.date && !item.formattedDate) {
                    try {
                        const [, month, day] = String(item.date).split("-")
                        formattedDate = `${day}/${month}`
                    } catch {
                        formattedDate = String(item.date).substring(5, 10).replace("-", "/")
                    }
                }

                return {
                    formattedDate,
                    total: Number(item.total) || 0,
                    success: Number(item.success) || 0,
                    error: Number(item.error) || 0,
                }
            })
            .filter((item): item is ChartPoint => Boolean(item && item.formattedDate && (item.total > 0 || item.success > 0 || item.error > 0)))
    }, [data])

    if (!data || !Array.isArray(data)) {
        return <ChartEmptyState message="Carregando dados do grafico..." />
    }

    if (validData.length === 0) {
        return <ChartEmptyState message="Nenhum dado disponivel para exibir" />
    }

    return (
        <Card className="genial-card col-span-4">
            <CardHeader>
                <CardTitle className="text-pure-white">Volume de Leads por Dia</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={validData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent-green)" stopOpacity={0.78} />
                                    <stop offset="95%" stopColor="var(--accent-green)" stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                                dataKey="formattedDate"
                                stroke="var(--muted-foreground)"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="var(--muted-foreground)"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                                domain={[0, "auto"]}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "var(--popover)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "12px",
                                    color: "var(--popover-foreground)",
                                    boxShadow: "var(--card-shadow)",
                                }}
                                labelStyle={{ color: "var(--popover-foreground)" }}
                                itemStyle={{ color: "var(--popover-foreground)" }}
                                cursor={{ stroke: "var(--accent-green)", strokeWidth: 2, strokeDasharray: "5 5" }}
                            />
                            <Area
                                type="monotone"
                                dataKey="success"
                                name="Leads"
                                stroke="var(--accent-green)"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                                dot={{ fill: "var(--accent-green)", r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                                activeDot={{ r: 6, stroke: "var(--card)", strokeWidth: 2 }}
                                connectNulls
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
})
