import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get('access_token') || process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = searchParams.get('advertiser_id') || process.env.TIKTOK_ADVERTISER_ID;

  if (!accessToken || !advertiserId) {
    return NextResponse.json(
      { error: 'Missing access_token or advertiser_id in query parameters.' },
      { status: 400 }
    );
  }

  // Define the date range (you would normally pass these dynamically from the frontend)
  // TikTok restricts the date range to a maximum of 365 days. We'll default to the last 30 days.
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  
  const startDate = start.toISOString().split('T')[0]; 
  const endDate = end.toISOString().split('T')[0];

  try {
    // 1. Fetch Performance Data via the Reporting API
    // We group by 'ad_id' to get creative-level performance.
    const reportUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
    
    // Required parameters for the Reporting API
    reportUrl.searchParams.append('advertiser_id', advertiserId);
    reportUrl.searchParams.append('report_type', 'BASIC');
    reportUrl.searchParams.append('data_level', 'AUCTION_AD');
    reportUrl.searchParams.append('dimensions', JSON.stringify(['ad_id', 'stat_time_day'])); 
    
    // Select the metrics you want to show on the dashboard
    // Note: removed 'conversions' as it caused a 40002 error. We can add specific conversion events later if needed.
    const metrics = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'app_install', 'purchase', 'video_play_actions'];
    reportUrl.searchParams.append('metrics', JSON.stringify(metrics));
    
    reportUrl.searchParams.append('start_date', startDate);
    reportUrl.searchParams.append('end_date', endDate);
    reportUrl.searchParams.append('page_size', '1000');

    let allReportData: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    let hasMore = true;

    while (hasMore && currentPage <= 5) {
      reportUrl.searchParams.set('page', currentPage.toString());
      console.log(`Fetching TikTok report page ${currentPage}...`, reportUrl.toString());

      const response = await fetch(reportUrl.toString(), {
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
      });

      const reportData = await response.json();

      if (reportData.code !== 0) {
        console.error('TikTok Reporting API Error:', reportData.message);
        if (currentPage === 1) {
          return NextResponse.json({ error: 'Failed to fetch report', details: reportData }, { status: 400 });
        }
        break;
      }

      const list = reportData?.data?.list || [];
      allReportData = allReportData.concat(list);

      totalPages = reportData?.data?.page_info?.total_page || 1;
      if (currentPage >= totalPages) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }

    // Only keep rows with spend > 0 or impressions > 0 to reduce processing
    const adsData = allReportData.filter((item: any) => 
      parseFloat(item.metrics.spend) > 0 || parseInt(item.metrics.impressions) > 0
    );

    let enrichedData = adsData;

    // --- Phase 2: Fetching Visual Thumbnails ---
    if (adsData.length > 0) {
      // 1. Extract the ad_ids from the report dimensions
      const adIds = adsData.map((item: any) => item.dimensions.ad_id).filter(Boolean);

      if (adIds.length > 0) {
        try {
          // 2. Query ad/get to find the video_id for each ad_id
          // TikTok limits ad_ids filtering. We will chunk them in batches of 50.
          const videoIds: string[] = [];
          const imageIds: string[] = [];
          const adToMediaMap: Record<string, { type: 'video' | 'image' | 'unknown', id: string, name: string, campaignName: string, tiktokItemId?: string, status?: string }> = {};
          
          for (let i = 0; i < adIds.length; i += 50) {
            const chunk = adIds.slice(i, i + 50);
            const adGetUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/ad/get/');
            adGetUrl.searchParams.append('advertiser_id', advertiserId);
            adGetUrl.searchParams.append('filtering', JSON.stringify({ ad_ids: chunk }));
            adGetUrl.searchParams.append('page_size', '100');
            
            const adResponse = await fetch(adGetUrl.toString(), {
              headers: { 'Access-Token': accessToken }
            });
            const adDetailsData = await adResponse.json();
            const adList = adDetailsData?.data?.list || [];

            adList.forEach((ad: any) => {
              const adName = ad.ad_name || ad.ad_id;
              const campaignName = ad.campaign_name || '';
              const status = ad.operation_status === 'ENABLE' ? 'Live' : 'Paused';
              if (ad.video_id) {
                videoIds.push(ad.video_id);
                adToMediaMap[ad.ad_id] = { type: 'video', id: ad.video_id, name: adName, campaignName, tiktokItemId: ad.tiktok_item_id, status };
              } else if (ad.image_ids && ad.image_ids.length > 0) {
                imageIds.push(ad.image_ids[0]);
                adToMediaMap[ad.ad_id] = { type: 'image', id: ad.image_ids[0], name: adName, campaignName, tiktokItemId: ad.tiktok_item_id, status };
              } else {
                // Ensure adName is captured even without media
                adToMediaMap[ad.ad_id] = { type: 'unknown', id: '', name: adName, campaignName, tiktokItemId: ad.tiktok_item_id, status };
              }
            });
          }

          // 3. Query video/info and image/info to get the cover URLs and preview URLs
          const mediaCoverMap: Record<string, { coverUrl: string, videoUrl?: string, postUrl?: string }> = {};
          
          if (videoIds.length > 0) {
            const uniqueVideoIds = Array.from(new Set(videoIds));
            // Chunk video IDs for info request
            for (let i = 0; i < uniqueVideoIds.length; i += 50) {
              const chunk = uniqueVideoIds.slice(i, i + 50);
              const videoInfoUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/');
              videoInfoUrl.searchParams.append('advertiser_id', advertiserId);
              videoInfoUrl.searchParams.append('video_ids', JSON.stringify(chunk));

              const videoResponse = await fetch(videoInfoUrl.toString(), {
                headers: { 'Access-Token': accessToken }
              });
              const videoData = await videoResponse.json();
              const videoInfos = videoData?.data?.list || [];

              videoInfos.forEach((v: any) => {
                if (v.video_cover_url) {
                  mediaCoverMap[v.video_id] = { 
                    coverUrl: v.video_cover_url,
                    videoUrl: v.preview_url || undefined
                  };
                }
              });
            }
          }
          
          if (imageIds.length > 0) {
            const uniqueImageIds = Array.from(new Set(imageIds));
            // Chunk image IDs
            for (let i = 0; i < uniqueImageIds.length; i += 50) {
              const chunk = uniqueImageIds.slice(i, i + 50);
              const imageInfoUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/');
              imageInfoUrl.searchParams.append('advertiser_id', advertiserId);
              imageInfoUrl.searchParams.append('image_ids', JSON.stringify(chunk));

              const imageResponse = await fetch(imageInfoUrl.toString(), {
                headers: { 'Access-Token': accessToken }
              });
              const imageData = await imageResponse.json();
              const imageInfos = imageData?.data?.list || [];

              imageInfos.forEach((img: any) => {
                if (img.image_url) {
                  mediaCoverMap[img.image_id] = { coverUrl: img.image_url };
                }
              });
            }
          }

          console.log(`TikTok Debug: Found ${videoIds.length} videos, ${imageIds.length} images. mediaCoverMap keys: ${Object.keys(mediaCoverMap).length}`);

          // 3b. Fallback for Spark Ads using oEmbed API
          const missingThumbnails = Object.keys(adToMediaMap).filter(adId => {
             const m = adToMediaMap[adId];
             return m.tiktokItemId && (!mediaCoverMap[m.id] || !mediaCoverMap[m.id].coverUrl);
          });
          
          if (missingThumbnails.length > 0) {
             console.log(`TikTok Debug: Fetching oEmbed for ${missingThumbnails.length} Spark Ads`);
             await Promise.all(missingThumbnails.map(async (adId) => {
                const m = adToMediaMap[adId];
                try {
                   const oembedUrl = `https://www.tiktok.com/oembed?url=https://www.tiktok.com/video/${m.tiktokItemId}`;
                   const oRes = await fetch(oembedUrl);
                   const oData = await oRes.json();
                   if (oData && oData.thumbnail_url) {
                      const itemId = m.tiktokItemId || '';
                      m.id = itemId; // use tiktok item id as the media id
                      mediaCoverMap[itemId] = { 
                         coverUrl: oData.thumbnail_url,
                         // we can't get raw mp4 from oembed, but we can set the tiktok link as postUrl
                         postUrl: `https://www.tiktok.com/video/${itemId}`
                      };
                   }
                } catch(err) {}
             }));
          }

          // 4. Merge the thumbnails back into the main reporting data
          enrichedData = adsData.map((item: any) => {
            const adId = item.dimensions.ad_id;
            const media = adToMediaMap[adId];
            const mediaData = media && media.id ? mediaCoverMap[media.id] : null;
            return {
              ...item,
              thumbnailUrl: mediaData ? mediaData.coverUrl : null,
              videoUrl: mediaData ? mediaData.videoUrl : null,
              postUrl: mediaData ? (mediaData as any).postUrl : null,
              tiktokItemId: media?.tiktokItemId || null,
              adName: media ? media.name : adId,
              campaignName: media ? media.campaignName : '',
              platform: 'tiktok', // Added platform flag for your UI
              status: media?.status || 'Unknown'
            };
          });
          
        } catch (mediaError) {
          console.error('Failed to fetch media thumbnails, returning text data only:', mediaError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'TikTok creatives fetched successfully!',
      count: enrichedData.length,
      data: enrichedData
    });

  } catch (error) {
    console.error('Error fetching TikTok creatives:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
