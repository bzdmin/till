/**
 * What a browser sees at the root.
 *
 * The counter answers agents in JSON, but a judge clicking a link is a person,
 * and raw JSON reads as a broken page. Same address, content negotiated.
 */
export const landing = (address: string, skills: { name: string; price: string; description: string }[], origin: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Till, a payment counter for agent skills</title>
<style>
  :root { --bg:#0b0d10; --panel:#12161b; --line:#1e252d; --ink:#e8edf3; --dim:#7d8b9a;
          --green:#3ddc97; --amber:#f0b429;
          --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); padding:44px 22px 80px;
         font:15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:760px; margin:0 auto; }
  h1 { font-size:30px; margin:0 0 6px; letter-spacing:-.02em; }
  .lede { color:var(--ink); font-size:17px; margin:0 0 6px; }
  .sub { color:var(--dim); margin:0 0 30px; }
  h2 { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--dim);
       margin:34px 0 12px; font-weight:600; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px;
          padding:15px 17px; margin-bottom:11px; }
  .row { display:flex; justify-content:space-between; align-items:baseline; gap:14px; }
  .name { font-family:var(--mono); font-size:14px; color:var(--green); }
  .price { font-family:var(--mono); font-size:14px; white-space:nowrap; }
  .desc { color:var(--dim); font-size:13.5px; margin-top:5px; }
  pre { background:var(--panel); border:1px solid var(--line); border-radius:10px;
        padding:14px 16px; overflow-x:auto; font-family:var(--mono); font-size:13px;
        color:var(--ink); margin:0 0 11px; }
  code { font-family:var(--mono); }
  a { color:var(--green); }
  .addr { font-family:var(--mono); font-size:12.5px; color:var(--dim); word-break:break-all; }
  table { border-collapse:collapse; width:100%; font-size:13.5px; }
  td { padding:7px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  td:first-child { color:var(--dim); padding-right:16px; white-space:nowrap; }
  td a { font-family:var(--mono); font-size:12px; word-break:break-all; }
  footer { margin-top:44px; color:var(--dim); font-size:13px; }
</style></head><body><div class="wrap">

<h1>Till</h1>
<p class="lede">A payment counter for agent skills.</p>
<p class="sub">One agent sells something small over HTTP, another buys it and pays inside the same
request. Settlement is EIP-3009 on BNB Chain. This page is the seller, and it is open for business.</p>

<h2>On the counter</h2>
${skills
  .map(
    (s) => `<div class="card">
  <div class="row"><span class="name">/skills/${s.name}</span><span class="price">${s.price}</span></div>
  <div class="desc">${s.description}</div>
</div>`,
  )
  .join("\n")}

<h2>Ask for one without paying</h2>
<pre>curl -i ${origin}/skills/btc-brief</pre>
<p class="sub">That returns <code>402 Payment Required</code> with the terms in B402 wire format:
USD1 on BNB Chain via <code>eip3009</code>. Attach a signed authorization and the same request
returns the work. Any pair Binance lists works, for example
<code>?symbol=ETHUSDT</code>.</p>

<h2>Paid for, on chain</h2>
<table>
  <tr><td>full loop</td><td><a href="https://bscscan.com/tx/0x7d18498d8ac02a10f10b819641f6b717aa27d5790e8bb6c5f633ae963e172530">0x7d18498d...</a></td></tr>
  <tr><td>signed by the Binance Agentic Wallet</td><td><a href="https://bscscan.com/tx/0xe2d6878ef479007ab26e2689651829d33754a113c152666b1cf80c45f5b6d5fc">0xe2d6878e...</a></td></tr>
  <tr><td>paid to a third party</td><td><a href="https://bscscan.com/tx/0x92bfab31360b1c773ce26a5ef3b922527c84857dcada9f7ebfbfb041ab20929f">0x92bfab31...</a></td></tr>
</table>

<h2>This counter</h2>
<p class="addr">${address}</p>

<footer>
Source and the full story: <a href="https://github.com/bzdmin/till">github.com/bzdmin/till</a><br />
Machine readable: <a href="${origin}/counter">${origin}/counter</a>
</footer>

</div></body></html>`;
