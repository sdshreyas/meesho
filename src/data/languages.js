// English + the 22 scheduled languages of India. `code` is the translation-API
// language code; `rtl` flips layout for Perso-Arabic scripts.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'mai', name: 'Maithili', native: 'मैथिली' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' },
  { code: 'gom', name: 'Konkani', native: 'कोंकणी' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', rtl: true },
  { code: 'doi', name: 'Dogri', native: 'डोगरी' },
  { code: 'mni-Mtei', name: 'Manipuri', native: 'ꯃꯤꯇꯩꯂꯣꯟ' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', rtl: true, limited: true },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', limited: true },
]

export const langByCode = (code) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
