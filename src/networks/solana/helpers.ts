import * as anchor from "@project-serum/anchor";


export function getProvider(
  connection: anchor.web3.Connection,
  keypair: anchor.web3.Keypair
): anchor.AnchorProvider {
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(
    connection,
    wallet,
    anchor.AnchorProvider.defaultOptions()
  );
}

export async function requestAirdrop(
  connection: anchor.web3.Connection,
  publicKey: anchor.web3.PublicKey
): Promise<void> {
  try{
    const fromAirDropSignature = await connection.requestAirdrop(publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(fromAirDropSignature);
    console.log("Airdropped 2 SOL to: ", publicKey.toBase58());


  }catch(er){
      console.log('Error Here: '+er)
  }
}
