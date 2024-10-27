// src/common/platform.ts
import { type Project } from "$lib/common/project";

export interface Platform {
    id: string;  // ergo, ethereum ...
    main_token: string; // ERG, ETH ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    connect(): Promise<void>;
    get_current_height(): Promise<number>;
    get_balance(id?: string): Promise<Map<string, number>>;
    withdraw(project: Project, amount: number): Promise<string | null>;
    exchange(project: Project, token_amount: number): Promise<string | null>;
    rebalance(project: Project, token_amount: number): Promise<string | null>;
    submit(data: {
        token_id: string | null; 
        token_amount: number | null;
        blockLimit: number;     // Block height until withdrawal/refund is allowed
        exchangeRate: number;   // Exchange rate ERG/Token
        projectLink: string;    // Link or hash containing project information
        minimumSold: number;     // Minimum amount sold to allow withdrawal
    }): Promise<string | null>;
    fetch(): Promise<Map<string, Project>>;
}
