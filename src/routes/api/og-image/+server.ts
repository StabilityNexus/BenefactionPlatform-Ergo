import type { RequestEvent } from '@sveltejs/kit';
import { generateOGImageSVG, type OGImageConfig } from '$lib/utils/og-image-generator';

/**
 * GET /api/og-image
 * Generates a dynamic OpenGraph preview image for social sharing
 * 
 * Query parameters:
 * - name: Project name
 * - status: Project status (e.g., "Active", "Ended", "Funded")
 * - description: Project description (optional)
 * - progress: Funding progress percentage 0-100 (optional, default: 0)
 * - theme: dark or light (optional, default: dark)
 */
export async function GET({ url }: RequestEvent) {
    try {
        // Extract query parameters
        const projectName = url.searchParams.get('name') || 'BenefactionPlatform';
        const projectStatus = url.searchParams.get('status') || 'Active';
        const description = url.searchParams.get('description') || '';
        const progress = Math.min(100, Math.max(0, parseInt(url.searchParams.get('progress') || '0')));
        const theme = (url.searchParams.get('theme') || 'dark') as 'dark' | 'light';

        // Validate inputs
        if (!projectName || projectName.length > 200) {
            return new Response('Invalid project name', { status: 400 });
        }

        if (!projectStatus || projectStatus.length > 50) {
            return new Response('Invalid project status', { status: 400 });
        }

        // Generate OG image SVG
        const ogConfig: OGImageConfig = {
            projectName: decodeURIComponent(projectName),
            projectStatus: decodeURIComponent(projectStatus),
            description: description ? decodeURIComponent(description) : '',
            progress,
            theme
        };

        const svgContent = generateOGImageSVG(ogConfig);

        // Return SVG with proper headers
        return new Response(svgContent, {
            status: 200,
            headers: {
                'Content-Type': 'image/svg+xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('OG image generation error:', error);
        return new Response('Error generating image', { status: 500 });
    }
}

/**
 * HEAD /api/og-image
 * Returns headers without body - useful for validating endpoint
 */
export async function HEAD() {
    return new Response(null, {
        status: 200,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
