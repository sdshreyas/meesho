import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useFetch } from '../useFetch.js'
import NetworkTab from '../components/ops/NetworkTab.jsx'
import OptimizerTab from '../components/ops/OptimizerTab.jsx'
import SimulatorTab from '../components/ops/SimulatorTab.jsx'
import { num } from '../components/ops/common.jsx'

const TABS = [
  ['network', '🗺️ Network & demand'],
  ['optimizer', '⚙️ Logistics optimiser'],
  ['simulator', '🧪 New DC simulator'],
]

/** Valmo Control Tower: logistics back office for Meesho leadership. */
export default function Ops() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'network'
  const { data: network } = useFetch(() => api.logistics.network(), [])

  return (
    <main className="page ops">
      <div className="ops-head">
        <div>
          <h2>Valmo Control Tower</h2>
          {network && (
            <small className="muted">
              {network.dcs.length} distribution centres · {network.sellers.length} sellers · {network.cities.length} delivery cities · {num(network.historyOrders)} orders in the last 6 months (simulated, 1 record = {num(network.scale)} orders)
            </small>
          )}
        </div>
        <nav className="ops-tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setParams({ tab: k })}>{l}</button>
          ))}
        </nav>
      </div>
      {!network ? (
        <div className="loading">Loading network…</div>
      ) : tab === 'optimizer' ? (
        <OptimizerTab network={network} />
      ) : tab === 'simulator' ? (
        <SimulatorTab network={network} />
      ) : (
        <NetworkTab network={network} />
      )}
    </main>
  )
}
