// Vérification des webhooks Viva auprès de l'API transactions.
// Logique portée depuis OrderMdj (post-incident wrapper Transactions[] de mai 2026) :
// un webhook n'est JAMAIS cru sur parole — on refetch la transaction chez Viva et on
// vérifie que son MerchantTrns correspond bien à la commande visée. Sans ça, n'importe
// quel POST forgé peut marquer une commande comme payée.

export type VivaTransaction = {
  MerchantTrns?: string
  StatusId?: string
  Amount?: number
  TransactionTypeId?: number
}

// Récupère la transaction côté Viva (Basic Auth merchant). Renvoie null si la transaction
// n'existe pas ou si on ne peut pas la vérifier — le caller doit alors ignorer l'événement.
export async function fetchVivaTransaction(transactionId: string): Promise<VivaTransaction | null> {
  try {
    const merchantId = process.env.VIVA_MERCHANT_ID
    const apiKey = process.env.VIVA_API_KEY
    if (!merchantId || !apiKey) {
      console.error('Missing VIVA_MERCHANT_ID or VIVA_API_KEY')
      return null
    }

    const credentials = Buffer.from(`${merchantId}:${apiKey}`).toString('base64')

    const response = await fetch(
      `https://www.vivapayments.com/api/transactions/${transactionId}`,
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    if (!response.ok) {
      console.error(`Viva verification failed: ${response.status}`)
      return null
    }

    // L'API Viva wrappe la transaction dans `{ Transactions: [ {...} ], Success: true }`.
    // Si le wrapper est absent (format historique), on retombe sur l'objet racine.
    const data = (await response.json()) as { Transactions?: VivaTransaction[] } & VivaTransaction
    return data.Transactions?.[0] ?? data
  } catch (error) {
    console.error('Viva verification error:', error)
    return null
  }
}

// Vérifie qu'une transaction Viva correspond bien à la commande visée par le webhook.
// Sans cette comparaison, un attaquant qui possède un TransactionId valide (le sien)
// peut le rejouer en webhook avec n'importe quel MerchantTrns (UUID d'une autre commande).
export async function verifiedTransaction(
  transactionId: string | undefined,
  expectedMerchantTrns: string | undefined
): Promise<VivaTransaction | null> {
  if (!transactionId || !expectedMerchantTrns) return null
  const viva = await fetchVivaTransaction(transactionId)
  if (!viva) return null
  if (viva.MerchantTrns !== expectedMerchantTrns) {
    console.error(
      `MerchantTrns mismatch — webhook says ${expectedMerchantTrns} but Viva says ${viva.MerchantTrns} for tx ${transactionId}`
    )
    return null
  }
  return viva
}
