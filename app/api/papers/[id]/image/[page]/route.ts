import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; page: string }> }
) {
  const { id, page } = await params
  const pageNum = parseInt(page)
  
  console.log(`[API /papers/${id}/image/${page}] GET`)
  
  try {
    const paperDir = path.join(UPLOAD_DIR, id)
    
    if (!fs.existsSync(paperDir)) {
      console.warn(`[API /papers/${id}/image/${page}] Paper directory not found`)
      return NextResponse.json({ error: 'Paper directory not found' }, { status: 404 })
    }
    
    // Find the image file
    const files = fs.readdirSync(paperDir)
    const sortedImages = files
      .filter(f => f.match(/^page-\d+\.png$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        return numA - numB
      })
    
    if (pageNum < 0 || pageNum >= sortedImages.length) {
      console.warn(`[API /papers/${id}/image/${page}] Page index out of range`)
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    
    const imagePath = path.join(paperDir, sortedImages[pageNum])
    
    if (!fs.existsSync(imagePath)) {
      console.warn(`[API /papers/${id}/image/${page}] Image file not found: ${imagePath}`)
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    
    const imageBuffer = fs.readFileSync(imagePath)
    console.log(`[API /papers/${id}/image/${page}] Serving image: ${sortedImages[pageNum]}`)
    
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error(`[API /papers/${id}/image/${page}] Error:`, err)
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 })
  }
}
