"use client";

import { usd } from "@/lib/format";
import { StrategyDef } from "@/lib/optionStrategies";
import { STRATEGY_GUIDE } from "@/lib/optionStrategyGuide";
import { OptionPayoff } from "@/lib/optionsMath";

export function StrategyGuide({
  strategy,
  payoff,
}: {
  strategy: StrategyDef;
  payoff?: OptionPayoff;
}) {
  const g = STRATEGY_GUIDE[strategy.id];
  const maxGain = payoff?.max_gain == null ? "Unlimited (from the live payoff)" : usd(payoff.max_gain);
  const maxLoss = payoff?.max_loss == null ? "Can keep growing (from the live payoff)" : usd(Math.abs(payoff.max_loss));
  const be = payoff?.breakevens?.length
    ? payoff.breakevens.map((b) => usd(b)).join(" and ")
    : "See the payoff chart once quotes load";

  return (
    <div className="panel p-4 space-y-4" data-testid="strategy-guide">
      <div>
        <div className="text-[10px] tracking-widest text-slate-500">{strategy.group.toUpperCase()}</div>
        <h2 className="text-lg font-semibold mt-0.5">{g.heading}</h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">{g.overview}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <Item label="How it is constructed" value={g.construction} />
        <Item label="How many legs" value={g.legs} />
        <Item label="Which contracts are bought" value={g.bought} />
        <Item label="Which contracts are sold" value={g.sold} />
        <Item label="When the strategy makes money" value={g.makesMoney} />
        <Item label="When the strategy loses money" value={g.losesMoney} />
        <Item
          label="Maximum potential profit"
          value={g.maxProfit}
          live={payoff ? `Live reading: ${maxGain}` : undefined}
        />
        <Item
          label="Maximum potential loss"
          value={g.maxLoss}
          live={payoff ? `Live reading: ${maxLoss}` : undefined}
        />
        <Item
          label="Breakeven points"
          value={g.breakeven}
          live={payoff ? `Live reading: ${be}` : undefined}
        />
        <Item label="What happens if the stock goes up" value={g.ifUp} live={payoff?.plain.if_up} />
        <Item label="What happens if the stock goes down" value={g.ifDown} live={payoff?.plain.if_down} />
        <Item
          label="What happens if the stock stays near the target price"
          value={g.ifFlat}
          live={payoff?.plain.if_flat}
        />
      </div>
    </div>
  );
}

function Item({ label, value, live }: { label: string; value: string; live?: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <p className="text-slate-300 leading-relaxed">{value}</p>
      {live ? <p className="text-xs text-slate-500 mt-1">{live}</p> : null}
    </div>
  );
}
