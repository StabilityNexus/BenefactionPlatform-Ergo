import type { TimeSeriesDataPoint } from "./metrics-collector";

export interface ChartConfig {
    width?: number;
    height?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    color?: string;
    strokeWidth?: number;
    showGrid?: boolean;
    showPoints?: boolean;
}

const DEFAULT_CONFIG: Required<ChartConfig> = {
    width: 400,
    height: 200,
    padding: { top: 20, right: 20, bottom: 30, left: 40 },
    color: "#3b82f6",
    strokeWidth: 2,
    showGrid: true,
    showPoints: true
};

/**
 * Generate SVG path for line chart
 */
export function generateLineChartPath(
    data: TimeSeriesDataPoint[],
    config: ChartConfig = {}
): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (data.length === 0) return "";

    const { width, height, padding } = cfg;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min/max values
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;

    // Find time range
    const times = data.map(d => d.timestamp);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    // Generate path
    const points = data.map((point, index) => {
        const x = padding.left + (point.timestamp - minTime) / timeRange * chartWidth;
        const y = padding.top + chartHeight - (point.value - minValue) / valueRange * chartHeight;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    });

    return points.join(' ');
}

/**
 * Generate SVG for line chart
 */
export function generateLineChartSVG(
    data: TimeSeriesDataPoint[],
    config: ChartConfig = {}
): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { width, height, padding, color, strokeWidth, showGrid, showPoints } = cfg;

    if (data.length === 0) {
        return `<svg width="${width}" height="${height}"><text x="${width/2}" y="${height/2}" text-anchor="middle">No data available</text></svg>`;
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min/max values
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;

    // Find time range
    const times = data.map(d => d.timestamp);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    // Generate grid lines
    const gridLines = showGrid ? (() => {
        const lines: string[] = [];
        // Horizontal grid lines
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            const value = maxValue - (valueRange / 5) * i;
            lines.push(`<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`);
            lines.push(`<text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="#6b7280">${formatValue(value)}</text>`);
        }
        return lines.join('');
    })() : '';

    // Generate path
    const path = generateLineChartPath(data, config);

    // Generate points
    const points = showPoints ? data.map((point, index) => {
        const x = padding.left + (point.timestamp - minTime) / timeRange * chartWidth;
        const y = padding.top + chartHeight - (point.value - minValue) / valueRange * chartHeight;
        return `<circle cx="${x}" cy="${y}" r="3" fill="${color}" stroke="white" stroke-width="1"/>`;
    }).join('') : '';

    // Generate axis labels
    const timeLabels = data.length > 0 ? (() => {
        const labels: string[] = [];
        const step = Math.max(1, Math.floor(data.length / 5));
        for (let i = 0; i < data.length; i += step) {
            const x = padding.left + (data[i].timestamp - minTime) / timeRange * chartWidth;
            const date = new Date(data[i].timestamp);
            const label = `${date.getMonth() + 1}/${date.getDate()}`;
            labels.push(`<text x="${x}" y="${height - padding.bottom + 15}" text-anchor="middle" font-size="10" fill="#6b7280">${label}</text>`);
        }
        return labels.join('');
    })() : '';

    return `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            ${gridLines}
            <path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>
            ${points}
            ${timeLabels}
        </svg>
    `;
}

/**
 * Generate SVG for bar chart
 */
export function generateBarChartSVG(
    data: Array<{ label: string; value: number }>,
    config: ChartConfig = {}
): string {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const { width, height, padding, color, showGrid } = cfg;

    if (data.length === 0) {
        return `<svg width="${width}" height="${height}"><text x="${width/2}" y="${height/2}" text-anchor="middle">No data available</text></svg>`;
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barWidth = chartWidth / data.length * 0.8;
    const barSpacing = chartWidth / data.length * 0.2;

    const values = data.map(d => d.value);
    const maxValue = Math.max(...values, 1);
    const valueRange = maxValue;

    // Generate bars
    const bars = data.map((item, index) => {
        const barHeight = (item.value / valueRange) * chartHeight;
        const x = padding.left + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = padding.top + chartHeight - barHeight;
        return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" opacity="0.8"/>
            <text x="${x + barWidth/2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="#6b7280">${formatValue(item.value)}</text>
        `;
    }).join('');

    // Generate grid lines
    const gridLines = showGrid ? (() => {
        const lines: string[] = [];
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            const value = maxValue - (valueRange / 5) * i;
            lines.push(`<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`);
        }
        return lines.join('');
    })() : '';

    // Generate labels
    const labels = data.map((item, index) => {
        const x = padding.left + index * (barWidth + barSpacing) + barWidth / 2;
        return `<text x="${x}" y="${height - padding.bottom + 15}" text-anchor="middle" font-size="10" fill="#6b7280" transform="rotate(-45 ${x} ${height - padding.bottom + 15})">${item.label}</text>`;
    }).join('');

    return `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            ${gridLines}
            ${bars}
            ${labels}
        </svg>
    `;
}

function formatValue(value: number): string {
    if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    }
    return value.toFixed(0);
}


