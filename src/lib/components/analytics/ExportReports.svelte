<script lang="ts">
    import { analyticsCollector } from '$lib/analytics/datacollector';
    import { Button } from '$lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Download, FileJson, FileSpreadsheet, CheckCircle } from 'lucide-svelte';
    import { fade } from 'svelte/transition';

    let exporting = false;
    let exportSuccess = false;
    let exportError = '';

    async function exportData(format: 'json' | 'csv') {
        exporting = true;
        exportError = '';
        exportSuccess = false;

        try {
            const data = analyticsCollector.exportData(format);
            const blob = new Blob([data], { 
                type: format === 'json' ? 'application/json' : 'text/csv' 
            });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `benefaction-analytics-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            exportSuccess = true;
            setTimeout(() => {
                exportSuccess = false;
            }, 3000);
        } catch (error) {
            exportError = error instanceof Error ? error.message : 'Export failed';
        } finally {
            exporting = false;
        }
    }

    function printReport() {
        window.print();
    }
</script>

<Card>
    <CardHeader>
        <CardTitle class="flex items-center gap-2">
            <Download class="w-5 h-5" />
            Export Reports
        </CardTitle>
    </CardHeader>
    <CardContent>
        <div class="space-y-4">
            <p class="text-sm text-muted-foreground">
                Download comprehensive analytics data including project metrics, time-series data, 
                trends, and contributor statistics.
            </p>

                       <div class="flex flex-wrap gap-3">
                <Button
                    on:click={() => exportData('json')}
                    disabled={exporting}
                    variant="outline"
                >
                    <div class="flex items-center gap-2">
                        <FileJson class="w-4 h-4" />
                        <span>Export JSON</span>
                    </div>
                </Button>

                <Button
                    on:click={() => exportData('csv')}
                    disabled={exporting}
                    variant="outline"
                >
                    <div class="flex items-center gap-2">
                        <FileSpreadsheet class="w-4 h-4" />
                        <span>Export CSV</span>
                    </div>
                </Button>

                <Button
                    on:click={printReport}
                    variant="outline"
                >
                    <div class="flex items-center gap-2">
                        <Download class="w-4 h-4" />
                        <span>Print Report</span>
                    </div>
                </Button>
            </div>

            {#if exportSuccess}
                <div 
                    class="flex items-center gap-2 text-green-600 text-sm"
                    transition:fade
                >
                    <CheckCircle class="w-4 h-4" />
                    Export successful!
                </div>
            {/if}

            {#if exportError}
                <div 
                    class="text-red-600 text-sm"
                    transition:fade
                >
                    Error: {exportError}
                </div>
            {/if}
        </div>
    </CardContent>
</Card>