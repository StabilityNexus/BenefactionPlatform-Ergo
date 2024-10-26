


export async function block_to_time(target_block: number): Promise<number>
{
    let current_block = await ergo.get_current_height();
    console.log(target_block)
    console.log(current_block)
    let diff_block = target_block - current_block;

    let time_per_block = 10*60*1000; // 10 minutes per block
    let diff_time = diff_block * time_per_block;
    
    return new Date().getTime() + diff_time;
}
