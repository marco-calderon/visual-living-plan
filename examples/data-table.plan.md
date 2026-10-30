---
title: Data table
summary: Search, sort, and filter loaded rows. Pagination appears at 100 rows.
agent: local-cursor
mode: watch
---

# Data table

The owners table stays on one page. The operations table has 120 rows, so it pages ten at a time.

<phase id="owners" title="Owners" status="done">
Six rows. Search covers Name and Detail. Name and State sort. State is the select. Notes does neither. There is no pagination control. Detail wraps when a cell sets `wrap`. A cell without it stays on one line, so a long value still scrolls the table sideways.

<Chip>gateway</Chip> <Pill tone="success">succeeded</Pill>

<DataTable label="Owners">
<Column id="name" header="Name" search sort />
<Column id="state" header="State" filter sort />
<Column id="notes" header="Notes" />
<Column id="detail" header="Detail" search />
<Row>
<Cell>Gateway</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell>
<Chip>gateway</Chip>
<Chip>api</Chip>
</Cell>
<Cell wrap>The gateway copies the hourly window forward and retries when the previous worker still holds the lease.</Cell>
</Row>
<Row>
<Cell>Limits</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell>
<ul>
<li>Hourly copy</li>
<li>Retry after the lease</li>
</ul>
</Cell>
<Cell wrap="40%">Hourly copy stays in this share of the table. The name and state columns keep their width.</Cell>
</Row>
<Row>
<Cell>Flags</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
<Cell>edge-route-without-wrapping-so-the-table-scrolls-sideways-when-the-column-does-not-fit</Cell>
</Row>
<Row>
<Cell>Budget</Cell>
<Cell value="pending"><Pill>pending</Pill></Cell>
<Cell>
<field name="watch" label="Watch" type="checkbox" default="true" />
</Cell>
<Cell wrap>Saved</Cell>
</Row>
<Row>
<Cell>Queue</Cell>
<Cell value="cancelled"><Pill>cancelled</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell wrap="32%">Queue copy retries after the lease expires and the next worker takes the window.</Cell>
</Row>
<Row>
<Cell>Edge</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
<Cell>Edge</Cell>
</Row>
</DataTable>
</phase>

<phase id="operations" title="Operations" status="active">
One hundred and twenty loaded rows. Type in the search, sort any column, or filter State.

<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter search sort />
<Column id="owner" header="Owner" search sort />
<Column id="checks" header="Checks" search sort />
<Row>
<Cell>GET /ops/1</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 1</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>POST /ops/2</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/3</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/4</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/5</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/6</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/7</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/8</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 8</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PATCH /ops/9</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/10</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/11</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/12</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/13</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/14</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/15</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 15</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>GET /ops/16</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/17</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/18</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/19</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/20</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/21</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/22</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 22</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PUT /ops/23</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/24</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/25</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/26</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/27</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/28</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/29</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 29</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>DELETE /ops/30</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/31</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/32</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/33</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/34</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/35</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/36</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 36</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>POST /ops/37</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/38</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/39</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/40</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/41</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/42</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/43</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 43</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PATCH /ops/44</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/45</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/46</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/47</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/48</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/49</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/50</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 50</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>GET /ops/51</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/52</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/53</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/54</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/55</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/56</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/57</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 57</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PUT /ops/58</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/59</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/60</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/61</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/62</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/63</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/64</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 64</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>DELETE /ops/65</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/66</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/67</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/68</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/69</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/70</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/71</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 71</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>POST /ops/72</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/73</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/74</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/75</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/76</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/77</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/78</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 78</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PATCH /ops/79</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/80</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/81</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/82</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/83</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/84</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/85</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 85</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>GET /ops/86</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/87</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/88</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/89</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/90</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/91</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>POST /ops/92</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 92</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PUT /ops/93</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/94</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/95</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/96</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/97</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/98</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/99</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 99</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>DELETE /ops/100</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/101</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/102</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/103</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/104</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/105</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/106</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="checked">
<Checkbox checked />
<ul>
<li>lease 106</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>POST /ops/107</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/108</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/109</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/110</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>GET /ops/111</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/112</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PUT /ops/113</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 113</li>
<li>retry</li>
</ul>
</Cell>
</Row>
<Row>
<Cell>PATCH /ops/114</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/115</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>GET /ops/116</Cell>
<Cell value="pending"><Pill tone="neutral">pending</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>POST /ops/117</Cell>
<Cell value="running"><Pill tone="warning">running</Pill></Cell>
<Cell><Chip>api</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>PUT /ops/118</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>edge</Chip></Cell>
<Cell value="checked"><Checkbox checked /></Cell>
</Row>
<Row>
<Cell>PATCH /ops/119</Cell>
<Cell value="failed"><Pill tone="danger">failed</Pill></Cell>
<Cell><Chip>queue</Chip></Cell>
<Cell value="unchecked"><Checkbox /></Cell>
</Row>
<Row>
<Cell>DELETE /ops/120</Cell>
<Cell value="cancelled"><Pill tone="neutral">cancelled</Pill></Cell>
<Cell><Chip>campaigns</Chip></Cell>
<Cell value="unchecked">
<Checkbox />
<ul>
<li>lease 120</li>
<li>retry</li>
</ul>
</Cell>
</Row>
</DataTable>
</phase>

<workflow id="tables" title="Data table">
```workflow
owners | Owners | owners
operations | Operations | operations
--
owners -> operations
```
</workflow>
