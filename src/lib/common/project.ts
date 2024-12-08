import { type Platform } from "./platform";
import type { Amount, Box } from "@fleet-sdk/core";

export interface TokenEIP4 {
    name: string,
    description: string,
    decimals: number
}

export interface ProjectContent {
    raw: string,
    title: string,
    description: string,
    link: string | null,
    image: string | null
}

export interface ConstantContent {
    raw?: string,
    owner: string
    dev_addr?: string,
    dev_hash: string,
    dev_fee: number,
    token_id: string,
    project_id: string
}

export interface Project {
    platform: Platform,
    box: Box<Amount>,
    project_id: string,
    token_id: string,
    block_limit: number,
    minimum_amount: number,
    amount_sold: number,
    value: number,  // Real exact value
    collected_value: number,  // Value collected
    current_value: number,  // Current value - contract reserves (ex: min box value on ergo)
    total_amount: number,
    current_amount: number,
    refunded_amount: number,
    exchange_rate: number, 
    token_details: TokenEIP4,
    content: ProjectContent,
    constants: ConstantContent
}

export async function is_ended(project: Project): Promise<boolean> {
    let height = await project.platform.get_current_height();

    return project.block_limit < height
}

export async function min_raised(project: Project): Promise<boolean> {
    return project.amount_sold >= project.minimum_amount
}

export function getProjectContent(id: string, value: string): ProjectContent {
    try {
        const parsed = JSON.parse(value);
        return {
            raw: value,
            title: parsed.title || 'Id '+id,
            description: parsed.description || "No description provided.",
            link: parsed.link || null,
            image: parsed.image || null
        };
    } catch (error) {
        return {
            raw: value,
            title: 'Id '+id,
            description: "No description provided.",
            link: null,
            image: null
        };
    }
}

export function getConstantContent(value: string): ConstantContent | null {
    try {
        const parsed = JSON.parse(value);
        return {
            raw: value,
            owner: parsed.owner,
            dev_addr: parsed.dev_addr,
            dev_hash: parsed.dev_hash,
            dev_fee: parsed.dev_fee,
            token_id: parsed.token_id,
            project_id: parsed.project_id
        }
    } catch(error) {
        return null;
    }
}