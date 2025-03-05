// src/common/platform.ts
import { type Project } from "$lib/common/project";
import { contract_version } from "$lib/ergo/contract";

export interface Platform {
    id: string;  // ergo, ethereum ...
    main_token: string; // ERG, ETH ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    connect(): Promise<void>;
    get_current_height(): Promise<number>;
    get_balance(id?: string): Promise<Map<string, number>>;
    withdraw(project: Project, amount: number): Promise<string | null>;
    buy_refund(project: Project, token_amount: number): Promise<string | null>;
    rebalance(project: Project, token_amount: number): Promise<string | null>;
    temp_exchange(project: Project, token_amount: number): Promise<string | null>;
    submit(
        version: contract_version,
        token_id: string,
        token_amount: number,
        blockLimit: number,
        exchangeRate: number,
        projectLink: string,
        minimumSold: number,
        title: string
    ): Promise<string | null>;
    fetch(): Promise<Map<string, Project>>;
}
