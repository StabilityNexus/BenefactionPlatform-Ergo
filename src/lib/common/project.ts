import { type Platform } from "./platform";
import type { Amount, Box } from "@fleet-sdk/core";

export interface ProjectContent {
    title: string,
    description: string,
    link: string | null,
    image: string | null
}

export interface Project {
    platform: Platform,
    box: Box<Amount>,
    token_id: string,
    block_limit: number,
    minimum_amount: number,
    amount_sold: number,
    value: number,
    total_amount: number,
    exchange_rate: number, 
    content: ProjectContent,
    owner: string
}

export async function is_ended(project: Project): Promise<boolean> {
    let height = await project.platform.get_current_height();

    return project.block_limit < height
}

export async function min_raised(project: Project): Promise<boolean> {
    return project.amount_sold > project.minimum_amount
}

export function getProjectContent(id: string, value: string): ProjectContent {
    try {
        const parsed = JSON.parse(value);
        return {
            title: parsed.title || 'Id '+id,
            description: parsed.description || "No description provided.",
            link: parsed.link || null,
            image: parsed.image || null
        };
    } catch (error) {
        return {
            title: 'Id '+id,
            description: "No description provided.",
            link: null,
            image: null
        };
    }
}
