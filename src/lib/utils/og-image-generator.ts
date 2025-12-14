/**
 * Dynamic OpenGraph image generator
 * Creates shareable preview images for social media platforms
 */

export interface OGImageConfig {
    projectName: string;
    projectStatus: string;
    description?: string;
    progress?: number; // 0-100
    theme?: 'dark' | 'light';
}

/**
 * Generates SVG-based OpenGraph image
 * This runs on the server to create dynamic preview images
 */
export function generateOGImageSVG(config: OGImageConfig): string {
    const {
        projectName,
        projectStatus,
        description = '',
        progress = 0,
        theme = 'dark'
    } = config;

    // Theme colors
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#0f0f0f' : '#ffffff';
    const textColor = isDark ? '#ffffff' : '#000000';
    const accentColor = '#ff9800'; // Orange
    const secondaryColor = isDark ? '#1a1a1a' : '#f5f5f5';
    const progressBgColor = isDark ? '#333333' : '#e0e0e0';

    // Truncate description
    const maxDescLength = 100;
    const displayDescription = description.length > maxDescLength 
        ? description.substring(0, maxDescLength) + '...' 
        : description;

    // SVG dimensions
    const width = 1200;
    const height = 630;
    const padding = 60;
    const contentWidth = width - padding * 2;

    // Progress bar dimensions
    const progressBarWidth = contentWidth;
    const progressBarHeight = 8;
    const progressBarY = height - 100;
    const filledWidth = (progressBarWidth * Math.min(progress, 100)) / 100;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${isDark ? '#1a1a2e' : '#f9f9f9'};stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:${isDark ? '#0f0f0f' : '#ffffff'};stop-opacity:0.1" />
        </linearGradient>
        
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            
            .title {
                font-family: 'Inter', sans-serif;
                font-size: 56px;
                font-weight: 700;
                fill: ${textColor};
            }
            
            .status {
                font-family: 'Inter', sans-serif;
                font-size: 20px;
                font-weight: 600;
                fill: ${accentColor};
            }
            
            .description {
                font-family: 'Inter', sans-serif;
                font-size: 18px;
                font-weight: 400;
                fill: ${isDark ? '#cccccc' : '#666666'};
            }
            
            .label {
                font-family: 'Inter', sans-serif;
                font-size: 14px;
                font-weight: 600;
                fill: ${isDark ? '#888888' : '#999999'};
            }
            
            .platform-text {
                font-family: 'Inter', sans-serif;
                font-size: 16px;
                font-weight: 500;
                fill: ${isDark ? '#aaaaaa' : '#555555'};
            }
        </style>
    </defs>
    
    <!-- Background -->
    <rect width="${width}" height="${height}" fill="${bgColor}"/>
    
    <!-- Top accent bar -->
    <rect width="${width}" height="6" fill="${accentColor}"/>
    
    <!-- Gradient overlay (subtle) -->
    <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
    
    <!-- Main content container -->
    <g>
        <!-- Project name -->
        <text x="${padding}" y="${padding + 80}" class="title">
            ${escapeXML(projectName.substring(0, 40))}
        </text>
        
        <!-- Status -->
        <text x="${padding}" y="${padding + 130}" class="status">
            ${escapeXML(projectStatus)}
        </text>
        
        <!-- Description -->
        ${displayDescription ? `
        <text x="${padding}" y="${padding + 190}" class="description">
            ${escapeXML(displayDescription.substring(0, 60))}
        </text>
        ` : ''}
        
        <!-- Progress section -->
        <text x="${padding}" y="${progressBarY - 30}" class="label">
            Funding Progress
        </text>
        
        <!-- Progress bar background -->
        <rect x="${padding}" y="${progressBarY}" width="${progressBarWidth}" height="${progressBarHeight}" 
              rx="4" fill="${progressBgColor}"/>
        
        <!-- Progress bar fill -->
        <rect x="${padding}" y="${progressBarY}" width="${filledWidth}" height="${progressBarHeight}" 
              rx="4" fill="${accentColor}"/>
        
        <!-- Progress percentage -->
        <text x="${padding + progressBarWidth + 20}" y="${progressBarY + 12}" class="label">
            ${progress.toFixed(0)}%
        </text>
        
        <!-- Platform branding -->
        <text x="${padding}" y="${height - 30}" class="platform-text">
            Hosted by @StabilityNexus • BenefactionPlatform
        </text>
    </g>
</svg>`;
}

/**
 * Escapes XML special characters
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
