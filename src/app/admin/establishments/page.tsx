async function geocodeAddress() {
  if (!form.address || !form.postal_code || !form.city) {
    setFormError('Remplissez l\'adresse complète pour géolocaliser')
    return
  }

  setGeocoding(true)
  setFormError('')

  try {
    const fullAddress = `${form.address}, ${form.postal_code} ${form.city}, Belgique`
    
    // Utiliser l'API route serveur (évite CORS)
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: fullAddress }),
    })

    const data = await response.json()

    if (data.success) {
      setForm({
        ...form,
        latitude: data.latitude.toFixed(6),
        longitude: data.longitude.toFixed(6),
      })
      console.log('Adresse trouvée:', data.address)
    } else {
      setFormError(data.error || 'Adresse non trouvée. Vérifiez et réessayez.')
    }
  } catch (error) {
    console.error('Geocoding error:', error)
    setFormError('Erreur lors de la géolocalisation')
  } finally {
    setGeocoding(false)
  }
}