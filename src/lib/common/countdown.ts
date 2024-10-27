import { type Platform } from "./platform";



export async function block_to_time(target_block: number, platform: Platform): Promise<number>
{
    let current_block = await platform.get_current_height();
    let diff_block = target_block - current_block;

    let diff_time = diff_block * platform.time_per_block;
    
    return new Date().getTime() + diff_time;
}

export async function time_to_block(target_time: number, platform: Platform): Promise<number>
{
    // Get the current block height
    let current_block = await platform.get_current_height();
    
    // Get the current timestamp in milliseconds
    let current_time = new Date().getTime();
    
    // Calculate the time difference in milliseconds
    let diff_time = target_time - current_time;
    
    // Calculate the number of blocks that will pass until the target time
    let diff_blocks = Math.ceil(diff_time / platform.time_per_block);
    
    // Calculate the target block number
    return current_block + diff_blocks;
}
