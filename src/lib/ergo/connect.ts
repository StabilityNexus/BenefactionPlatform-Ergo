import { address, connected, network, balance } from "../common/store";


export async function connectNautilus() {
    if (typeof ergoConnector !== 'undefined') {
    const nautilus = ergoConnector.nautilus;
    if (nautilus) {
        if (await nautilus.connect()) {
            console.log('Connected!');
            address.set(await ergo.get_change_address());
            network.set("ergo-mainnet");
            balance.set(await ergo.get_balance("ERG"));
            connected.set(true);
        } else {
            alert('Not connected!');
        }
    } else {
        alert('Nautilus Wallet is not active');
    }
    } else {
        alert('No wallet available');
    }
}
