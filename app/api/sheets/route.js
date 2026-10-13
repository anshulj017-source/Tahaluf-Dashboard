import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  let url;
  if (type === 'combined') {
    const gid = searchParams.get('gid');
    url = process.env.COMBINED_COUNTRY_CSV_URL + (gid ? `&gid=${gid}` : '');
  } else if (type === 'adjust') {
    url = process.env.RAW_ADJUST_CSV_URL;
  } else if (type === 'creative') {
    url = process.env.CREATIVE_CSV_URL;
  } else if (type === 'planned') {
    url = process.env.PLANNED_DATA_CSV_URL;
  } else if (type === 'afc') {
    const gid = searchParams.get('gid');
    if (!gid) {
      return new NextResponse('Missing gid for afc sheet', { status: 400 });
    }
    url = `${process.env.AFC_SHEET_BASE_URL}&gid=${gid}`;
  } else {
    return new NextResponse('Invalid sheet type', { status: 400 });
  }

  if (!url) {
    return new NextResponse('Missing sheet URL configuration', { status: 500 });
  }

  try {
    let response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      console.warn(`Google Sheets returned status ${response.status} for ${url}`);
      return new NextResponse('', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' }
      });
    }
    
    let text = await response.text();

    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.warn(`Google Sheets returned HTML instead of CSV for ${url}`);
      return new NextResponse('', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' }
      });
    }

    if (text.startsWith('Loading...')) {
      console.log(`Google Sheets returned Loading... Retrying without cache for ${url}`);
      await new Promise(r => setTimeout(r, 1000));
      response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (response.ok) {
        text = await response.text();
      }
    }
    
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error fetching sheet:', error);
    return new NextResponse('', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' }
    });
  }
}
