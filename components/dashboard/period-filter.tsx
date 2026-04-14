"use client"

import { Button } from "@/components/ui/button"
import { Calendar, TrendingUp } from "lucide-react"

interface PeriodFilterProps {
    value: "7d" | "15d" | "30d" | "90d" | "custom"
    onChange: (period: "7d" | "15d" | "30d" | "90d" | "custom") => void
    customStartDate: string
    customEndDate: string
    onCustomStartDateChange: (value: string) => void
    onCustomEndDateChange: (value: string) => void
    onApplyCustomRange: () => void
    loading?: boolean
}

const periods = [
    { value: "7d" as const, label: "7 Dias", icon: Calendar },
    { value: "15d" as const, label: "15 Dias", icon: Calendar },
    { value: "30d" as const, label: "30 Dias", icon: Calendar },
    { value: "90d" as const, label: "90 Dias", icon: TrendingUp },
    { value: "custom" as const, label: "Personalizado", icon: Calendar },
]

export function PeriodFilter({
    value,
    onChange,
    customStartDate,
    customEndDate,
    onCustomStartDateChange,
    onCustomEndDateChange,
    onApplyCustomRange,
    loading,
}: PeriodFilterProps) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-text-gray font-medium mr-2">Periodo:</span>
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
                                ? "bg-gradient-to-r from-accent-green to-dark-green text-black font-semibold shadow-lg shadow-accent-green/30 hover:shadow-accent-green/50"
                                : "border-border-gray text-text-gray hover:text-pure-white hover:border-accent-green/50 hover:bg-accent-green/10"
                            }
            `}
                    >
                        <Icon className={`w-4 h-4 mr-2 ${isActive ? "text-black" : ""}`} />
                        {period.label}
                    </Button>
                )
            })}

            {value === "custom" && (
                <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border-gray/60 bg-foreground/5 p-2">
                    <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => onCustomStartDateChange(e.target.value)}
                        disabled={loading}
                        className="h-9 rounded-md border border-border-gray bg-card px-2 text-sm text-pure-white"
                    />
                    <span className="text-xs text-text-gray">ate</span>
                    <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => onCustomEndDateChange(e.target.value)}
                        disabled={loading}
                        className="h-9 rounded-md border border-border-gray bg-card px-2 text-sm text-pure-white"
                    />
                    <Button
                        onClick={onApplyCustomRange}
                        disabled={loading || !customStartDate || !customEndDate}
                        size="sm"
                        className="bg-accent-green text-black hover:bg-dark-green"
                    >
                        Aplicar
                    </Button>
                </div>
            )}
        </div>
    )
}
