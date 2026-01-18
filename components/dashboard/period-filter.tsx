"use client"

import { Button } from "@/components/ui/button"
import { Calendar, TrendingUp } from "lucide-react"

interface PeriodFilterProps {
    value: '7d' | '15d' | '30d' | '90d'
    onChange: (period: '7d' | '15d' | '30d' | '90d') => void
    loading?: boolean
}

const periods = [
    { value: '7d' as const, label: '7 Dias', icon: Calendar },
    { value: '15d' as const, label: '15 Dias', icon: Calendar },
    { value: '30d' as const, label: '30 Dias', icon: Calendar },
    { value: '90d' as const, label: '90 Dias', icon: TrendingUp },
]

export function PeriodFilter({ value, onChange, loading }: PeriodFilterProps) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-gray font-medium mr-2">Período:</span>
            {periods.map((period) => {
                const Icon = period.icon
                const isActive = value === period.value

                return (
                    <Button
                        key={period.value}
                        onClick={() => onChange(period.value)}
                        disabled={loading}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className={`
              transition-all duration-300
              ${isActive
                                ? "bg-gradient-to-r from-accent-yellow to-dark-yellow text-black font-semibold shadow-lg shadow-accent-yellow/30 hover:shadow-accent-yellow/50"
                                : "border-border-gray text-text-gray hover:text-pure-white hover:border-accent-yellow/50 hover:bg-accent-yellow/10"
                            }
            `}
                    >
                        <Icon className={`w-4 h-4 mr-2 ${isActive ? "text-black" : ""}`} />
                        {period.label}
                    </Button>
                )
            })}
        </div>
    )
}
