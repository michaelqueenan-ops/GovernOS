
import React, { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'

type Scenario = 'Conservative' | 'Base' | 'Optimistic'

const currencySymbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }

function encodeState(obj: any) {
  try {
    const json = JSON.stringify(obj)
    return encodeURIComponent(btoa(unescape(encodeURIComponent(json))))
  } catch { return '' }
}
function decodeState(s: string) {
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(s))))
    return JSON.parse(json)
  } catch { return null }
}

const defaultInputs = {
  profile: { currency: 'GBP', employeeCount: 500, governedDomains: 10, toolsInStack: 6 },
  peopleProcess: {
    analystFTEs: 6, analystCost: 85000,
    engineerFTEs: 4, engineerCost: 110000,
    operatorFTEs: 6, operatorCost: 70000,
    ticketsPerMonth: 350, minutesPerTicket: 30,
    changeReqPerMonth: 60, hoursPerChange: 2.5,
    onboardingDays: 90, contractorSpendPerMonth: 0,
  },
  softwareInfra: {
    privacyDiscovery: 250000, catalogGlossary: 180000, grcWorkflow: 120000,
    dataQualityMdm: 100000, siemAllocation: 60000, cloudOpsShare: 75000,
  },
  riskCompliance: {
    auditHoursPerYear: 800, externalAssessSpend: 120000,
    nonComplianceProb: 0.05, nonComplianceImpact: 1200000,
    incidentsPerYear: 6, incidentCost: 40000, mttrDays: 3,
  },
  valueLevers: {
    ticketDeflection: 0.5, onboardingReduction: 0.6, coverageUplift: 0.35,
    auditHoursReduction: 0.5, externalAssessReduction: 0.3, mttrReduction: 0.4,
    toolsRetiredCount: 2, toolsRetiredAnnualCost: 120000,
    realizedValueUplift: 0.2, valuePoolPerProject: 250000, projectsPerYear: 6,
  },
  governOS: { baseLicenseAnnual: 500000, implementationOneTime: 120000, addOnAnnual: 0 },
  finance: { horizonYears: 3, discountRate: 0.1, scenario: 'Base' as Scenario },
}

const scenarioFactors = { Base: 1, Conservative: 0.7, Optimistic: 1.25 }

const minutesToHours = (m: number) => m / 60
const toAnnualPeopleCost = (fte: number, cost: number) => fte * cost
const quarterize = (v: number) => v / 4
const fmt = (v: number, ccy: string) => `${currencySymbols[ccy] ?? '£'}${Math.round(v).toLocaleString()}`

function npv(rate: number, cfs: number[], periodsPerYear = 4) {
  const r = rate / periodsPerYear
  return cfs.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i + 1), 0)
}
function irr(cashflows: number[], guess = 0.1, periodsPerYear = 4) {
  let rate = guess
  for (let i = 0; i < 100; i++) {
    const f = cashflows.reduce((acc, cf, k) => acc + cf / Math.pow(1 + rate / periodsPerYear, k + 1), 0)
    const df = cashflows.reduce((acc, cf, k) => acc - ((k + 1) * cf) / Math.pow(1 + rate / periodsPerYear, k + 2) / periodsPerYear, 0)
    const nr = rate - f / df
    if (isFinite(nr) && Math.abs(nr - rate) < 1e-7) return nr
    rate = isFinite(nr) ? nr : rate * 0.5
  }
  return rate
}

function useRoi(inputs: typeof defaultInputs) {
  const scenMul = scenarioFactors[inputs.finance.scenario]
  return useMemo(() => {
    const cur = inputs.profile.currency
    const analystAnnual = toAnnualPeopleCost(inputs.peopleProcess.analystFTEs, inputs.peopleProcess.analystCost)
    const engineerAnnual = toAnnualPeopleCost(inputs.peopleProcess.engineerFTEs, inputs.peopleProcess.engineerCost)
    const operatorAnnual = toAnnualPeopleCost(inputs.peopleProcess.operatorFTEs, inputs.peopleProcess.operatorCost)
    const contractorAnnual = inputs.peopleProcess.contractorSpendPerMonth * 12

    const ticketHoursYear = inputs.peopleProcess.ticketsPerMonth * 12 * minutesToHours(inputs.peopleProcess.minutesPerTicket)
    const changeHoursYear = inputs.peopleProcess.changeReqPerMonth * 12 * inputs.peopleProcess.hoursPerChange
    const blendedPeopleRate = (analystAnnual + engineerAnnual + operatorAnnual) / (inputs.peopleProcess.analystFTEs + inputs.peopleProcess.engineerFTEs + inputs.peopleProcess.operatorFTEs) / 2080
    const ticketChangeCost = (ticketHoursYear + changeHoursYear) * blendedPeopleRate

    const teamDailyCost = ((inputs.peopleProcess.analystCost + inputs.peopleProcess.engineerCost + inputs.peopleProcess.operatorCost) / 3) / 260
    const onboardingCost = inputs.peopleProcess.onboardingDays * teamDailyCost

    const softwareAnnual = inputs.softwareInfra.privacyDiscovery + inputs.softwareInfra.catalogGlossary + inputs.softwareInfra.grcWorkflow + inputs.softwareInfra.dataQualityMdm + inputs.softwareInfra.siemAllocation + inputs.softwareInfra.cloudOpsShare

    const auditInternalAnnual = inputs.riskCompliance.auditHoursPerYear * blendedPeopleRate
    const auditExternalAnnual = inputs.riskCompliance.externalAssessSpend
    const expectedLossAnnual = inputs.riskCompliance.nonComplianceProb * inputs.riskCompliance.nonComplianceImpact
    const incidentsAnnual = inputs.riskCompliance.incidentsPerYear * inputs.riskCompliance.incidentCost

    const baselineContext = {
      people: analystAnnual + engineerAnnual + operatorAnnual + contractorAnnual,
      ticketsChanges: ticketChangeCost,
      onboarding: onboardingCost,
      software: softwareAnnual,
      complianceAudit: auditInternalAnnual + auditExternalAnnual,
      expectedLoss: expectedLossAnnual,
      incidents: incidentsAnnual,
    }

    const deflect = inputs.valueLevers.ticketDeflection * scenMul
    const obReduce = inputs.valueLevers.onboardingReduction * scenMul
    const auditHoursRed = inputs.valueLevers.auditHoursReduction * scenMul
    const extAssessRed = inputs.valueLevers.externalAssessReduction * scenMul
    const mttrRed = inputs.valueLevers.mttrReduction * scenMul
    const toolsRetired = Math.round(inputs.valueLevers.toolsRetiredCount * scenMul)
    const toolRetireAnnual = toolsRetired * inputs.valueLevers.toolsRetiredAnnualCost

    const peopleTicketsSaved = ticketChangeCost * deflect
    const onboardingSaved = onboardingCost * obReduce
    const auditInternalSaved = auditInternalAnnual * auditHoursRed
    const auditExternalSaved = auditExternalAnnual * extAssessRed
    const incidentSaved = incidentsAnnual * mttrRed
    const softwareSaved = toolRetireAnnual
    const riskAvoided = expectedLossAnnual * (0.25 * scenMul)
    const valuePoolAnnual = inputs.valueLevers.valuePoolPerProject * inputs.valueLevers.projectsPerYear
    const accelerationGain = valuePoolAnnual * inputs.valueLevers.realizedValueUplift * scenMul

    const annualBenefits = peopleTicketsSaved + onboardingSaved + auditInternalSaved + auditExternalSaved + incidentSaved + softwareSaved + riskAvoided + accelerationGain
    const annualCosts = inputs.governOS.baseLicenseAnnual + inputs.governOS.addOnAnnual
    const oneTime = inputs.governOS.implementationOneTime

    const quarters = inputs.finance.horizonYears * 4
    const perQBenefits = quarterize(annualBenefits)
    const perQCosts = quarterize(annualCosts)
    const cashflows: number[] = []
    for (let q = 0; q < quarters; q++) cashflows.push(perQBenefits - perQCosts - (q === 0 ? oneTime : 0))

    let cum = -oneTime
    const cumulative: { name: string; value: number }[] = []
    let paybackQuarter = -1
    for (let i = 0; i < quarters; i++) {
      cum += perQBenefits - perQCosts
      cumulative.push({ name: `Q${i + 1}`, value: Math.round(cum) })
      if (paybackQuarter === -1 && cum >= 0) paybackQuarter = i + 1
    }

    const year1Net = cashflows.slice(0, 4).reduce((a, b) => a + b, 0)
    const threeYrNet = cashflows.reduce((a, b) => a + b, 0)
    const roiPct = threeYrNet / (annualCosts * inputs.finance.horizonYears + oneTime)
    const npvVal = npv(inputs.finance.discountRate, cashflows)
    const irrVal = irr(cashflows)

    const benefitBars = [
      { name: 'Tickets/Changes', value: Math.round(peopleTicketsSaved) },
      { name: 'Onboarding', value: Math.round(onboardingSaved) },
      { name: 'Audit (Internal)', value: Math.round(auditInternalSaved) },
      { name: 'Audit (External)', value: Math.round(auditExternalSaved) },
      { name: 'Incidents', value: Math.round(incidentSaved) },
      { name: 'Consolidation', value: Math.round(softwareSaved) },
      { name: 'Risk Avoided', value: Math.round(riskAvoided) },
      { name: 'Value Acceleration', value: Math.round(accelerationGain) },
    ]

    // demo tornado (approximate, not true recompute)
    const baseNPV = npvVal
    const labels = ['Ticket Deflection %','Onboarding Reduction %','Tools Retired','Incident/Non-Compliance Impact','Audit Hours Reduction %','External Assess Reduction %','MTTR Reduction %','Value Uplift %']
    const tornado = labels.map((label, i) => {
      const deltaNPV = Math.abs(baseNPV * (0.15 * (i === 3 ? 0.25 * scenMul : 1)))
      return { name: label, range: deltaNPV * 2, low: baseNPV - deltaNPV, high: baseNPV + deltaNPV }
    })

    return {
      currency: cur,
      cashflows, cumulative, benefitBars, baselineContext,
      summary: {
        paybackMonths: paybackQuarter === -1 ? null : paybackQuarter * 3,
        year1Net, roiPct, npv: npvVal, irr: irrVal, threeYrNet
      },
      tornado
    }
  }, [inputs])
}

function NumberInput({ label, value, onChange, step=1, min=0 }: any) {
  return (
    <div>
      <div className="label">{label}</div>
      <input className="input" type="number" value={value} step={step} min={min} onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

function MoneyInput({ label, value, onChange, currency }: any) {
  return <NumberInput label={`${label} (${currencySymbols[currency]})`} value={value} onChange={onChange} step={1000} />
}

export default function App() {
  const [inputs, setInputs] = useState(defaultInputs)
  const [tab, setTab] = useState<'summary'|'cio'|'ciso'|'cfo'>('summary')
  const data = useRoi(inputs)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('s')
    if (s) {
      const parsed = decodeState(s)
      if (parsed) setInputs(parsed)
    }
  }, [])

  const onShare = () => {
    const s = encodeState(inputs)
    const url = `${window.location.origin}${window.location.pathname}?s=${s}`
    window.history.replaceState({}, '', url)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => alert('Sharable link copied to clipboard.'))
    } else {
      const ta = document.createElement('textarea'); ta.value = url
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      alert('Sharable link copied to clipboard.')
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1">GovernOS ROI Model</div>
          <div className="sub">Interactive calculator for CIO / CISO / CFO</div>
        </div>
        <div className="controls">
          <select className="select" value={inputs.profile.currency} onChange={e => setInputs({ ...inputs, profile: { ...inputs.profile, currency: e.target.value } })}>
            <option value="GBP">GBP £</option><option value="USD">USD $</option><option value="EUR">EUR €</option>
          </select>
          <select className="select" value={inputs.finance.scenario} onChange={e => setInputs({ ...inputs, finance: { ...inputs.finance, scenario: e.target.value as any } })}>
            <option value="Conservative">Conservative</option><option value="Base">Base</option><option value="Optimistic">Optimistic</option>
          </select>
          <button className="button" onClick={() => setInputs(structuredClone(defaultInputs))}>Reset</button>
          <button className="button" onClick={onShare}>Share Link</button>
        </div>
      </div>

      <div className="grid grid-2" style={{alignItems:'start'}}>
        <div className="grid" style={{gap:16}}>
          <div className="card">
            <div className="cardHeader">Company Profile</div>
            <div className="cardBody inputGrid two">
              <NumberInput label="Employees" value={inputs.profile.employeeCount} onChange={(v:number)=>setInputs({ ...inputs, profile: { ...inputs.profile, employeeCount: v }})} />
              <NumberInput label="Governed Data Domains" value={inputs.profile.governedDomains} onChange={(v:number)=>setInputs({ ...inputs, profile: { ...inputs.profile, governedDomains: v }})} />
              <NumberInput label="Tools in Stack" value={inputs.profile.toolsInStack} onChange={(v:number)=>setInputs({ ...inputs, profile: { ...inputs.profile, toolsInStack: v }})} />
              <NumberInput label="Horizon (years)" value={inputs.finance.horizonYears} onChange={(v:number)=>setInputs({ ...inputs, finance: { ...inputs.finance, horizonYears: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">People & Process</div>
            <div className="cardBody inputGrid three">
              <NumberInput label="Analyst FTEs" value={inputs.peopleProcess.analystFTEs} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, analystFTEs: v }})} />
              <MoneyInput label="Analyst Cost (annual)" currency={inputs.profile.currency} value={inputs.peopleProcess.analystCost} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, analystCost: v }})} />
              <NumberInput label="Engineer FTEs" value={inputs.peopleProcess.engineerFTEs} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, engineerFTEs: v }})} />
              <MoneyInput label="Engineer Cost (annual)" currency={inputs.profile.currency} value={inputs.peopleProcess.engineerCost} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, engineerCost: v }})} />
              <NumberInput label="Operator FTEs" value={inputs.peopleProcess.operatorFTEs} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, operatorFTEs: v }})} />
              <MoneyInput label="Operator Cost (annual)" currency={inputs.profile.currency} value={inputs.peopleProcess.operatorCost} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, operatorCost: v }})} />
            </div>
            <div className="cardBody inputGrid six">
              <NumberInput label="Tickets / Month" value={inputs.peopleProcess.ticketsPerMonth} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, ticketsPerMonth: v }})} />
              <NumberInput label="Minutes / Ticket" value={inputs.peopleProcess.minutesPerTicket} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, minutesPerTicket: v }})} />
              <NumberInput label="Change Requests / Month" value={inputs.peopleProcess.changeReqPerMonth} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, changeReqPerMonth: v }})} />
              <NumberInput label="Hours / Change" value={inputs.peopleProcess.hoursPerChange} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, hoursPerChange: v }})} />
              <NumberInput label="Onboarding Days" value={inputs.peopleProcess.onboardingDays} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, onboardingDays: v }})} />
              <MoneyInput label="Contractors / Month" currency={inputs.profile.currency} value={inputs.peopleProcess.contractorSpendPerMonth} onChange={(v:number)=>setInputs({ ...inputs, peopleProcess: { ...inputs.peopleProcess, contractorSpendPerMonth: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">Software & Infra (Annualized)</div>
            <div className="cardBody inputGrid three">
              <MoneyInput label="Privacy/Discovery" currency={inputs.profile.currency} value={inputs.softwareInfra.privacyDiscovery} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, privacyDiscovery: v }})} />
              <MoneyInput label="Catalog/Glossary" currency={inputs.profile.currency} value={inputs.softwareInfra.catalogGlossary} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, catalogGlossary: v }})} />
              <MoneyInput label="GRC/Workflow" currency={inputs.profile.currency} value={inputs.softwareInfra.grcWorkflow} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, grcWorkflow: v }})} />
              <MoneyInput label="Data Quality/MDM" currency={inputs.profile.currency} value={inputs.softwareInfra.dataQualityMdm} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, dataQualityMdm: v }})} />
              <MoneyInput label="SIEM Allocation" currency={inputs.profile.currency} value={inputs.softwareInfra.siemAllocation} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, siemAllocation: v }})} />
              <MoneyInput label="Cloud Ops Share" currency={inputs.profile.currency} value={inputs.softwareInfra.cloudOpsShare} onChange={(v:number)=>setInputs({ ...inputs, softwareInfra: { ...inputs.softwareInfra, cloudOpsShare: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">Risk & Compliance</div>
            <div className="cardBody inputGrid three">
              <NumberInput label="Audit Hours / Year" value={inputs.riskCompliance.auditHoursPerYear} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, auditHoursPerYear: v }})} />
              <MoneyInput label="External Assessor Spend" currency={inputs.profile.currency} value={inputs.riskCompliance.externalAssessSpend} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, externalAssessSpend: v }})} />
              <NumberInput label="Incidents / Year" value={inputs.riskCompliance.incidentsPerYear} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, incidentsPerYear: v }})} />
              <MoneyInput label="Incident Cost" currency={inputs.profile.currency} value={inputs.riskCompliance.incidentCost} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, incidentCost: v }})} />
              <NumberInput label="Non‑Compliance Prob (%)" value={inputs.riskCompliance.nonComplianceProb * 100} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, nonComplianceProb: v/100 }})} />
              <MoneyInput label="Non‑Compliance Impact" currency={inputs.profile.currency} value={inputs.riskCompliance.nonComplianceImpact} onChange={(v:number)=>setInputs({ ...inputs, riskCompliance: { ...inputs.riskCompliance, nonComplianceImpact: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">GovernOS Value Levers</div>
            <div className="cardBody inputGrid four">
              <NumberInput label="Ticket Deflection (%)" value={inputs.valueLevers.ticketDeflection*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, ticketDeflection: v/100 }})} />
              <NumberInput label="Onboarding Reduction (%)" value={inputs.valueLevers.onboardingReduction*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, onboardingReduction: v/100 }})} />
              <NumberInput label="Audit Hours Reduction (%)" value={inputs.valueLevers.auditHoursReduction*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, auditHoursReduction: v/100 }})} />
              <NumberInput label="External Assess Reduction (%)" value={inputs.valueLevers.externalAssessReduction*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, externalAssessReduction: v/100 }})} />
              <NumberInput label="MTTR Reduction (%)" value={inputs.valueLevers.mttrReduction*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, mttrReduction: v/100 }})} />
              <NumberInput label="Tools Retired (count)" value={inputs.valueLevers.toolsRetiredCount} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, toolsRetiredCount: v }})} />
              <MoneyInput label="Avg Cost / Retired Tool" currency={inputs.profile.currency} value={inputs.valueLevers.toolsRetiredAnnualCost} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, toolsRetiredAnnualCost: v }})} />
              <NumberInput label="Value Uplift (%)" value={inputs.valueLevers.realizedValueUplift*100} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, realizedValueUplift: v/100 }})} />
              <MoneyInput label="Value / Project" currency={inputs.profile.currency} value={inputs.valueLevers.valuePoolPerProject} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, valuePoolPerProject: v }})} />
              <NumberInput label="Projects / Year" value={inputs.valueLevers.projectsPerYear} onChange={(v:number)=>setInputs({ ...inputs, valueLevers: { ...inputs.valueLevers, projectsPerYear: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">GovernOS Pricing</div>
            <div className="cardBody inputGrid three">
              <MoneyInput label="Base License (annual)" currency={inputs.profile.currency} value={inputs.governOS.baseLicenseAnnual} onChange={(v:number)=>setInputs({ ...inputs, governOS: { ...inputs.governOS, baseLicenseAnnual: v }})} />
              <MoneyInput label="Implementation (one‑time)" currency={inputs.profile.currency} value={inputs.governOS.implementationOneTime} onChange={(v:number)=>setInputs({ ...inputs, governOS: { ...inputs.governOS, implementationOneTime: v }})} />
              <MoneyInput label="Add‑ons (annual)" currency={inputs.profile.currency} value={inputs.governOS.addOnAnnual} onChange={(v:number)=>setInputs({ ...inputs, governOS: { ...inputs.governOS, addOnAnnual: v }})} />
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">Finance Controls</div>
            <div className="cardBody inputGrid two">
              <NumberInput label="Discount Rate (%)" value={inputs.finance.discountRate*100} onChange={(v:number)=>setInputs({ ...inputs, finance: { ...inputs.finance, discountRate: v/100 }})} />
            </div>
          </div>
        </div>

        <div className="grid" style={{gap:16}}>
          <div className="tabList">
            <div className={`tabBtn ${tab==='summary'?'active':''}`} onClick={()=>setTab('summary')}>Summary</div>
            <div className={`tabBtn ${tab==='cio'?'active':''}`} onClick={()=>setTab('cio')}>CIO</div>
            <div className={`tabBtn ${tab==='ciso'?'active':''}`} onClick={()=>setTab('ciso')}>CISO</div>
            <div className={`tabBtn ${tab==='cfo'?'active':''}`} onClick={()=>setTab('cfo')}>CFO</div>
          </div>

          {tab==='summary' && (
            <div className="grid" style={{gap:16}}>
              <div className="card">
                <div className="cardHeader">Headline Metrics</div>
                <div className="cardBody kpiGrid">
                  <div className="kpi"><div className="small">Payback</div><div className="big">{data.summary.paybackMonths ? `${data.summary.paybackMonths} months` : '< 36+ months'}</div></div>
                  <div className="kpi"><div className="small">Year‑1 Net Impact</div><div className="big">{fmt(data.summary.year1Net, data.currency)}</div></div>
                  <div className="kpi"><div className="small">3‑Year ROI</div><div className="big">{(data.summary.roiPct*100).toFixed(0)}%</div></div>
                  <div className="kpi"><div className="small">3‑Year NPV</div><div className="big">{fmt(data.summary.npv, data.currency)}</div></div>
                  <div className="kpi"><div className="small">IRR</div><div className="big">{(data.summary.irr*100).toFixed(1)}%</</div></div>
                  <div className="kpi"><div className="small">3‑Year Net</div><div className="big">{fmt(data.summary.threeYrNet, data.currency)}</div></div>
                </div>
              </div>

              <div className="card">
                <div className="cardHeader">Cumulative Cash Flow</div>
                <div className="cardBody chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.cumulative} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v)=>`${currencySymbols[data.currency]}${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v:any)=>fmt(v, data.currency)} />
                      <Line type="monotone" dataKey="value" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="cardHeader">Benefit Breakdown (Annualized)</div>
                <div className="cardBody chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.benefitBars} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" interval={0} angle={-12} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v)=>`${currencySymbols[data.currency]}${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v:any)=>fmt(v, data.currency)} />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="cardHeader">Sensitivity (NPV Tornado – demo)</div>
                <div className="cardBody chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.tornado} layout="vertical" margin={{ left: 80, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v)=>`${currencySymbols[data.currency]}${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={180} />
                      <Tooltip formatter={(v:any)=>fmt(v, data.currency)} />
                      <Bar dataKey="range" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="small" style={{marginTop:8}}>Demo approximation: varies top drivers ±15% of base NPV (scenario‑scaled).</div>
                </div>
              </div>
            </div>
          )}

          {tab==='cio' && (
            <div className="card">
              <div className="cardHeader">CIO – Operations & Velocity</div>
              <div className="cardBody kpiGrid">
                {data.benefitBars.slice(0,4).map((r:any)=>(
                  <div className="kpi" key={r.name}><div className="small">{r.name}</div><div className="big">{fmt(r.value, data.currency)}</div></div>
                ))}
              </div>
            </div>
          )}

          {tab==='ciso' && (
            <div className="card">
              <div className="cardHeader">CISO – Risk & Compliance</div>
              <div className="cardBody kpiGrid">
                {data.benefitBars.slice(2,6).map((r:any)=>(
                  <div className="kpi" key={r.name}><div className="small">{r.name}</div><div className="big">{fmt(r.value, data.currency)}</div></div>
                ))}
                <div className="kpi"><div className="small">Compliance Risk Avoided</div><div className="big">{fmt(data.benefitBars[6].value, data.currency)}</div></div>
              </div>
            </div>
          )}

          {tab==='cfo' && (
            <div className="grid" style={{gap:16}}>
              <div className="card">
                <div className="cardHeader">Quarterly Cash Flows</div>
                <div className="cardBody chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.cumulative.map((d:any,i:number)=>({ name:d.name, cash:(data.cashflows[i]), cum:d.value }))} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v)=>`${currencySymbols[data.currency]}${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v:any)=>fmt(v, data.currency)} />
                      <Line type="monotone" dataKey="cash" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cum" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <div className="cardHeader">GovernOS Costs & Returns</div>
                <div className="cardBody inputGrid">
                  <div className="row"><span className="small">3‑Year NPV</span><span className="big">{fmt(data.summary.npv, data.currency)}</span></div>
                  <div className="row"><span className="small">IRR</span><span className="big">{(data.summary.irr*100).toFixed(1)}%</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="cardHeader">Baseline Context (annualized)</div>
            <div className="cardBody inputGrid three">
              {Object.entries(data.baselineContext).map(([k,v])=> (
                <div key={k} className="row"><span className="small">{k}</span><span className="big">{fmt(v as number, data.currency)}</span></div>
              ))}
            </div>
          </div>

          <div className="footerNote">Notes: Figures are illustrative. Adjust inputs to match your environment. NPV/IRR computed on quarterly cash flows; sensitivity uses demo approximation.</div>
        </div>
      </div>
    </div>
  )
}
