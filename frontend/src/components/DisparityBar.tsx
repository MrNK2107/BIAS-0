import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

interface DisparityBarProps {
  data: { group: string; rate: number; label?: string }[]
  title?: string
}

export function DisparityBar({ data, title }: DisparityBarProps) {
  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-medium text-[#D4A373]">{title}</h3>}
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d35" />
          <XAxis dataKey="group" stroke="#888" fontSize={12} />
          <YAxis stroke="#888" fontSize={12} domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
          <Tooltip
            contentStyle={{ background: "#1A1D23", border: "1px solid #2a2d35", borderRadius: 6 }}
            labelStyle={{ color: "#D4A373" }}
            formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
          />
          <Bar dataKey="rate" fill="#D4A373" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
