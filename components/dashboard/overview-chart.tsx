"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface OverviewChartProps {
    data: any[]
}

export function OverviewChart({ data }: OverviewChartProps) {
    return (
        <Card className="genial-card col-span-4">
            <CardHeader>
                <CardTitle className="text-pure-white">Volume de Atendimentos (7 dias)</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00cc6a" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#00cc6a" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis
                                dataKey="formattedDate"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "#111",
                                    border: "1px solid #333",
                                    borderRadius: "8px",
                                    color: "#fff",
                                }}
                                itemStyle={{ color: "#fff" }}
                                cursor={{ stroke: "#333", strokeWidth: 1 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="total"
                                name="Total"
                                stroke="#00ff88"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTotal)"
                            />
                            <Area
                                type="monotone"
                                dataKey="success"
                                name="Sucessos"
                                stroke="#00cc6a"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorSuccess)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
