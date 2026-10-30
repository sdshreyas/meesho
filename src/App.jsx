import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './store.jsx'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import Product from './pages/Product.jsx'
import Cart from './pages/Cart.jsx'
import Orders from './pages/Orders.jsx'
import Track from './pages/Track.jsx'
import Seller from './pages/Seller.jsx'
import Login from './pages/Login.jsx'

function Shell() {
  const { profile, session, t } = useApp()
  const seller = profile.type === 'seller'
  if (!session) return <Login />
  return (
    <>
      <Header />
      <Routes key={profile.id}>
        <Route path="/" element={seller ? <Navigate to="/seller" replace /> : <Home />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/track/:id" element={<Track />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="footer">{t('prototypeNote')}</footer>
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </HashRouter>
  )
}
