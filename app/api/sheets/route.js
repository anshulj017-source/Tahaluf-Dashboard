import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  let url;
  if (type === 'combined') {
    url = process.env.COMBINED_COUNTRY_CSV_URL;
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
    const response = await fetch(url, { next: { revalidate: 60 } }); // Cache for 60 seconds
    if (!response.ok) throw new Error('Failed to fetch from Google Sheets');
    
    const text = await response.text();
    
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error fetching sheet:', error);
    return new NextResponse('Error fetching data', { status: 500 });
  }
}
