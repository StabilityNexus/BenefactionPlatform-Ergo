<script lang="ts">
    import { onMount } from "svelte";
    
    export let data: Array<{ label: string; value: number }>;
    export let width: number = 600;
    export let height: number = 400;
    export let title: string = "";
    export let xAxisLabel: string = "";
    export let yAxisLabel: string = "";
    export let color: string = "#3b82f6";
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    
    const padding = { top: 40, right: 40, bottom: 60, left: 70 };
    
    onMount(() => {
        ctx = canvas.getContext("2d");
        drawChart();
    });
    
    $: if (canvas && data) {
        drawChart();
    }
    
    function drawChart() {
        if (!ctx || !data || data.length === 0) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Find min/max values
        const maxValue = Math.max(...data.map(d => d.value));
        const minValue = Math.min(...data.map(d => d.value), 0);
        const valueRange = maxValue - minValue;
        
        // Draw background
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
        ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
        
        // Draw grid lines
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (chartHeight / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            
            // Y-axis labels
            const value = maxValue - (valueRange / gridLines) * i;
            ctx.fillStyle = "#888";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(value.toFixed(2), padding.left - 10, y);
        }
        
        // Draw line
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        data.forEach((point, index) => {
            const x = padding.left + (chartWidth / (data.length - 1)) * index;
            const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
            
            if (index === 0) {
                ctx!.moveTo(x, y);
            } else {
                ctx!.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw points
        data.forEach((point, index) => {
            const x = padding.left + (chartWidth / (data.length - 1)) * index;
            const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
            
            ctx!.beginPath();
            ctx!.arc(x, y, 4, 0, Math.PI * 2);
            ctx!.fillStyle = color;
            ctx!.fill();
            ctx!.strokeStyle = "#fff";
            ctx!.lineWidth = 2;
            ctx!.stroke();
        });
        
        // Draw X-axis labels (show every nth label to avoid crowding)
        const labelFrequency = Math.ceil(data.length / 10);
        ctx.fillStyle = "#888";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        data.forEach((point, index) => {
            if (index % labelFrequency === 0 || index === data.length - 1) {
                const x = padding.left + (chartWidth / (data.length - 1)) * index;
                const labelText = point.label.length > 10 
                    ? point.label.substring(0, 10) + "..." 
                    : point.label;
                ctx!.fillText(labelText, x, padding.top + chartHeight + 10);
            }
        });
        
        // Draw axis labels
        if (xAxisLabel) {
            ctx.fillStyle = "#666";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(xAxisLabel, padding.left + chartWidth / 2, height - 20);
        }
        
        if (yAxisLabel) {
            ctx.save();
            ctx.translate(20, padding.top + chartHeight / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#666";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(yAxisLabel, 0, 0);
            ctx.restore();
        }
        
        // Draw title
        if (title) {
            ctx.fillStyle = "#333";
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(title, width / 2, 20);
        }
    }
</script>

<div class="chart-container">
    <canvas bind:this={canvas} {width} {height}></canvas>
</div>

<style>
    .chart-container {
        display: flex;
        justify-content: center;
        padding: 1rem;
    }
    
    canvas {
        border-radius: 0.5rem;
    }
</style>
