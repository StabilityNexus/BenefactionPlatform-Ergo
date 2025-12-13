// src/common/platform.ts
import { type Project } from "$lib/common/project";
import { type contract_version } from "$lib/ergo/contract";

export interface Platform {
    id: string;  // ergo, basis ...
    main_token: string; // ERG, BTC ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    last_version: contract_version;
    connect(): Promise<void>;
    get_current_height(): number | Promise<number>;
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
        is_timestamp_limit: boolean,
        exchangeRate: number,
        projectLink: string,
        minimumSold: number,
        title: string,
        base_token_id?: string
    ): AsyncGenerator<string, string | null, void>;
    fetch(): Promise<Map<string, Project>>;
}
