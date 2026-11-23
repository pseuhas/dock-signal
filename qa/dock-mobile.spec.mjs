// Review-only QA spec. Run against the isolated review branch on a sanctioned CI runner.
import {test,expect} from '@playwright/test';

const infoURL='https://gbfs.citibikenyc.com/gbfs/en/station_information.json';
const statusURL='https://gbfs.citibikenyc.com/gbfs/en/station_status.json';
const app=process.env.DOCK_QA_URL ?? 'http://127.0.0.1:4173';
const now=Date.parse('2026-11-23T13:00:00Z');
const sec=now/1000;
const rows=[
  {station_id:'ad17bd9a-735b-4a11-8ad3-dc7800e342af',short_name:'6566.01',name:'Southpoint Park',lat:40.753702,lon:-73.958652},
  {station_id:'66dd4356-0aca-4d06-aa7c-3863bb44ef7c',name:'1 Ave & E 62 St',lat:40.761227,lon:-73.960940},
  {station_id:'88bf1344-354f-4699-bdbd-1c2584fc41ee',short_name:'6814.01',name:'Motorgate',lat:40.763909,lon:-73.947721},
  {station_id:'2263855457844687416',short_name:'6881.01',name:'Main St & River Rd',lat:40.766359,lon:-73.945787},
];
async function install(page,{globalStale=false,offline=false,onlyOffIsland=false}={}){
  await page.clock.setFixedTime(now);
  await page.route('**/*',route => route.request().url().startsWith(app+'/') ? route.continue() : route.abort());
  const cors={'access-control-allow-origin':'*'};
  await page.route(infoURL,route=>offline?route.abort():route.fulfill({json:{data:{stations:rows}},headers:cors}));
  await page.route(statusURL,route=>offline?route.abort():route.fulfill({
    headers:cors,
    json:{last_updated:sec-(globalStale?450:10),ttl:60,data:{stations:rows.map(({station_id},index)=>({
      station_id,
      is_installed:1,is_renting:1,is_returning:1,
      num_bikes_available:5,num_docks_available:3,num_ebikes_available:index===2?null:0,
      last_reported:sec-(index===0 || (onlyOffIsland&&index!==1)?450:15),
    }))}},
  }));
}
for(const width of [320,393]) test(`${width}px: local fix rejects closer Manhattan result and keeps backup`,async({page,context},testInfo)=>{
  await page.setViewportSize({width,height:760});
  await page.emulateMedia({reducedMotion:'reduce'});
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude:rows[0].lat,longitude:rows[0].lon,accuracy:15});
  await install(page);
  await page.goto(app);
  await expect(page.locator('#notice')).toContainText('Live feed');
  await page.locator('#locate').focus();
  await expect(page.locator('#locate')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#location-message')).toContainText('in this tab only');
  await expect(page.locator('#featured-name')).toHaveText('Motorgate');
  await expect(page.locator('#backup')).toHaveText('Backup: Main St & River Rd');
  const contrast=await page.locator('#backup').evaluate(link=>{
    function lum(rgb){
      return rgb.match(/[0-9.]+/g).slice(0,3).map(v=>Number(v)/255)
        .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
        .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    }
    const foreground=lum(getComputedStyle(link).color);
    const background=lum(getComputedStyle(link.closest('#featured')).backgroundColor);
    return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('#stations h3').first()).toHaveText('1 Ave & E 62 St');
  await expect(page.locator('#result-note')).toContainText('includes other banks');
  for(const id of ['directions','backup']){
    const u=new URL(await page.locator('#'+id).getAttribute('href'));
    expect(u.searchParams.has('origin')).toBe(false);
    expect(u.searchParams.get('travelmode')).toBe('walking');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('fresh-'+width+'.png'),fullPage:true,animations:'disabled'});
  const mode=page.getByRole('radio',{name:'Pick up a bike'});
  await mode.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio',{name:'Return a bike'})).toBeChecked();
  await expect(page.locator('#featured-label')).toContainText('Return on Roosevelt Island');
});
test('degraded data never creates a destination recommendation',async({browser},testInfo)=>{
  for(const [overrides,headline] of [
    [{globalStale:true},'No fresh station readings'],
    [{onlyOffIsland:true},'No fresh match on the island'],
    [{offline:true},'Live availability unavailable'],
  ]){
    const page=await browser.newPage();
    try{
      await page.setViewportSize({width:320,height:760});
      await page.emulateMedia({reducedMotion:'reduce'});
      await install(page,overrides);
      await page.goto(app);
      await expect(page.locator('#featured-name')).toHaveText(headline);
      await expect(page.locator('#directions')).toBeHidden();
      await expect(page.locator('#backup')).toBeHidden();
      await expect(page.getByRole('link',{name:'Official map'})).toBeVisible();
      await page.screenshot({path:testInfo.outputPath(Object.keys(overrides)[0]+'.png'),fullPage:true,animations:'disabled'});
    }finally{await page.close();}
  }
});
