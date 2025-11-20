import { type contract_version } from "$lib/ergo/contract";
import { type Platform } from "./platform";
import type { Amount, Box } from "@fleet-sdk/core";

export interface TokenEIP4 {
    name: string,
    description: string,
    decimals: number,
    emissionAmount: number | null
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
    owner: string,
    dev_addr?: string,
    dev_hash: string,
    dev_fee: number,
    pft_token_id: string,
    base_token_id?: string  // Base token ID for multi-token support (empty for ERG)
}

export interface Project {
    version: contract_version,
    platform: Platform,
    box: Box<Amount>,
    project_id: string,
    current_idt_amount: number,
    pft_token_id: string,
    base_token_id: string,  // Base token ID for contributions (empty string for ERG)
    base_token_details?: TokenEIP4,  // Details of the base token (null for ERG)
    block_limit: number,
    minimum_amount: number,
    maximum_amount: number,
    value: number,  // Real exact value
    current_value: number,  // Current value - contract reserves (ex: min box value on ergo)
    total_pft_amount: number,
    current_pft_amount: number,
    unsold_pft_amount: number,
    sold_counter: number,
    refund_counter: number,
    auxiliar_exchange_counter: number,
    exchange_rate: number,  // Base token per PFT exchange rate
    token_details: TokenEIP4,
    content: ProjectContent,
    constants: ConstantContent
}

export async function is_ended(project: Project): Promise<boolean> {
    let height = await project.platform.get_current_height();

    return project.block_limit < height
}

export async function min_raised(project: Project): Promise<boolean> {
    return project.sold_counter >= project.minimum_amount
}

export async function max_raised(project: Project): Promise<boolean> {
    return project.sold_counter == project.maximum_amount
}

export function getProjectContent(id: string, value: string): ProjectContent {
    try {
        const parsed = JSON.parse(value);
        return {
            raw: value,
            title: parsed.title || 'Id '+id,
            description: parsed.description || "No description provided.",
            link: parsed.link || null,
            image: parsed.image || "https://camarasal.com/wp-content/uploads/2020/08/default-image-5-1.jpg"
        };
    } catch (error) {
        return {
            
            raw: value,
            title: 'Id '+id,
            description: "No description provided.",
            link: null,
            image: "https://camarasal.com/wp-content/uploads/2020/08/default-image-5-1.jpg"
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
            pft_token_id: parsed.token_id,
            base_token_id: parsed.base_token_id || ""  // Default to empty string for ERG
        }
    } catch(error) {
        return null;
    }
}