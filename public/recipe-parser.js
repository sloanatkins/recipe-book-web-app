// ================================
// RECIPE PARSER - FINAL VERSION
// Local parsing only, no modal, direct file input
// ================================

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const HEIC2ANY_CDN = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

let tesseractLoaded = false;
let pdfJsLoaded = false;
let heic2anyLoaded = false;

console.log('🚀 Recipe Parser Loading...');

// ================================
// LOAD EXTERNAL LIBRARIES
// ================================
async function loadTesseract() {
    if (tesseractLoaded) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = TESSERACT_CDN;
        script.onload = () => {
            tesseractLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function loadPdfJs() {
    if (pdfJsLoaded) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDF_JS_CDN;
        script.onload = () => {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            pdfJsLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function loadHeic2Any() {
    if (heic2anyLoaded) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = HEIC2ANY_CDN;
        script.onload = () => {
            heic2anyLoaded = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ================================
// FILE UPLOAD HANDLER
// ================================
async function handleRecipeFileUpload(file) {
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    console.log('📄 Processing file:', fileName, 'Type:', fileType);
    
    try {
        let text = '';
        let imageData = null;
        
        // Handle different file types
        if (fileType.includes('image') || fileName.endsWith('.heic') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
            // Handle HEIC conversion first
            if (fileName.endsWith('.heic')) {
                console.log('🔄 Converting HEIC...');
                await loadHeic2Any();
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.9
                });
                file = new File([convertedBlob], fileName.replace('.heic', '.jpg'), { type: 'image/jpeg' });
            }
            
            // OCR for images
            console.log('🔍 Running OCR...');
            await loadTesseract();
            const result = await performOCR(file);
            text = result.text;
            imageData = result.imageData;
            
        } else if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
            // Extract text from PDF
            console.log('📄 Extracting PDF text...');
            await loadPdfJs();
            text = await extractTextFromPDF(file);
            
        } else if (fileType.includes('text') || fileName.endsWith('.txt')) {
            // Plain text file
            text = await file.text();
            
        } else {
            throw new Error('Unsupported file type. Please use images (PNG, JPG, HEIC), PDF, or text files.');
        }
        
        console.log('✅ Text extracted, length:', text.length);
        console.log('📄 First 500 chars of extracted text:', text.substring(0, 500));
        
        // For images, use simpler parsing approach
        let parsedRecipe;
        if (fileType.includes('image') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.heic')) {
            console.log('🖼️ Using simplified image parser...');
            parsedRecipe = parseRecipeTextSimple(text);
        } else {
            // For PDFs and text files, use the full parser
            parsedRecipe = parseRecipeText(text);
        }
        
        return {
            ...parsedRecipe,
            imageData: imageData
        };
        
    } catch (error) {
        console.error('❌ Error processing file:', error);
        throw error;
    }
}

// ================================
// OCR FOR IMAGES
// ================================
async function performOCR(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                // Use better OCR settings for recipe images
                const { data: { text } } = await Tesseract.recognize(
                    e.target.result,
                    'eng',
                    {
                        logger: info => {
                            if (info.status === 'recognizing text') {
                                console.log('OCR Progress:', Math.round(info.progress * 100) + '%');
                            }
                        },
                        // Better OCR settings for recipe text
                        tessedit_pageseg_mode: '6', // Assume uniform block of text
                        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:;!?()[]{}-\'"/\\s%°C°F'
                    }
                );
                
                console.log('🔍 OCR extracted text length:', text.length);
                console.log('📄 Full OCR text:', text);
                console.log('📄 First 1000 chars:', text.substring(0, 1000));
                
                const imageData = e.target.result;
                resolve({ text, imageData });
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ================================
// PDF TEXT EXTRACTION
// ================================
async function extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const typedArray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                
                let fullText = '';
                
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ================================
// NORMALIZE FRACTIONS
// ================================
function normalizeFractions(text) {
    // Map of unicode vulgar fractions to standard format
    const fractionMap = {
        '½': '1/2',
        '⅓': '1/3',
        '⅔': '2/3',
        '¼': '1/4',
        '¾': '3/4',
        '⅕': '1/5',
        '⅖': '2/5',
        '⅗': '3/5',
        '⅘': '4/5',
        '⅙': '1/6',
        '⅚': '5/6',
        '⅛': '1/8',
        '⅜': '3/8',
        '⅝': '5/8',
        '⅞': '7/8'
    };
    
    // Replace unicode vulgar fractions with standard format
    for (const [unicode, standard] of Object.entries(fractionMap)) {
        // Handle mixed numbers: "2½" → "2 1/2" (add space before fraction)
        // But be smart about OCR errors: "21½" should become "2 1/2" not "21 1/2"
        text = text.replace(new RegExp(`(\\d+)${unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), (match, digits) => {
            // If it's a 2-digit number ending in 1-3, it might be OCR misreading a mixed number
            // Example: "21½" (from OCR) should be "2 1/2", not "21 1/2"
            if (digits.length === 2) {
                const tens = parseInt(digits[0]);
                const ones = parseInt(digits[1]);
                // Common mixed numbers: 2-9 whole units with 1/2, 1/4, or 3/4
                if (tens >= 2 && tens <= 9 && ones >= 1 && ones <= 3 && 
                    (standard === '1/2' || standard === '1/4' || standard === '3/4')) {
                    return `${tens} ${standard}`;
                }
            }
            // Otherwise, just add space: "2½" → "2 1/2"
            return `${digits} ${standard}`;
        });
        // Handle standalone fractions: "½" → "1/2"
        text = text.replace(new RegExp(unicode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), standard);
    }
    
    // Fix mixed numbers that might have been parsed incorrectly by OCR
    // Common OCR error: "2 1/2" gets read as "21/2" or "21½"
    // Pattern: 2-digit number ending in 1-3 followed by a simple fraction
    // Examples: "21/2" → "2 1/2", "31/4" → "3 1/4", "23/4" → "2 3/4"
    text = text.replace(/(\d)([1-3])\/([2-4])/g, (match, tens, ones, denom) => {
        // Only fix if it looks like a mixed number (tens digit 1-9, ones is 1-3, denom is 2-4)
        const tensNum = parseInt(tens);
        const onesNum = parseInt(ones);
        const denomNum = parseInt(denom);
        
        // Valid mixed numbers: 1-9 whole units with 1-3 numerator and 2-4 denominator
        if (tensNum >= 1 && tensNum <= 9 && onesNum >= 1 && onesNum <= 3 && denomNum >= 2 && denomNum <= 4) {
            // Additional check: if the whole number part is > 10, it's less likely to be a mixed number
            // But if it's 2-9 with 1-3 numerator, it's very likely a mixed number
            if (tensNum <= 9) {
                return `${tens} ${ones}/${denom}`;
            }
        }
        return match;
    });
    
    // Fix incomplete fractions like "3/" - try to complete them based on context
    // This is a best-guess approach - if we see "3/" followed by a space or end, assume "3/4"
    text = text.replace(/(\d+)\/\s+/g, (match, num) => {
        // Common fractions: if it's 3, likely 3/4; if 1, likely 1/2 or 1/4
        if (num === '3') return '3/4 ';
        if (num === '1') return '1/2 '; // Default to 1/2, but could be 1/4
        return match;
    });
    
    // Ensure proper spacing around fractions: "1/2cup" → "1/2 cup"
    text = text.replace(/(\d+\/\d+)([a-zA-Z])/g, '$1 $2');
    
    // Ensure proper spacing before fractions: "cup1/2" → "cup 1/2" (less common but possible)
    text = text.replace(/([a-zA-Z])(\d+\/\d+)/g, '$1 $2');
    
    return text;
}

// ================================
// SIMPLE PARSER FOR IMAGES (OCR TEXT)
// ================================
function parseRecipeTextSimple(text) {
    console.log('🖼️ Using simple image parser...');
    
    // Normalize text
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = normalizeFractions(text);
    
    const recipe = {
        title: '',
        ingredients: '',
        instructions: '',
        servings: 0,
        minutes: 0,
        rating: 0
    };
    
    // Extract title - look for actual recipe title, not generic placeholders
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Skip common non-title patterns at the start
    const skipPatterns = [
        /^(add|ingredients?|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i,
        /^(follow|like|share|save|comment|if you want)/i,
        /^[@#]/,
        /^https?:\/\//,
        /^(nutrition|calories|serves|makes|yield|prep|cook|total|author|course|cuisine)/i,
        /^\d+:\d+/, // Time stamps like "10:40"
        /^saved$/i,
        /^\d+\.\d+[km]?\s*(likes?|comments?|shares?|saves?)/i // Social media metrics
    ];
    
    for (const line of lines) {
        // Stop if we hit a section header
        if (line.match(/^(recipe|ingredients?|method|instructions?|directions?|steps?)(\s*:)?$/i)) {
            break;
        }
        
        // Skip lines that match skip patterns
        if (skipPatterns.some(pattern => line.match(pattern))) {
            continue;
        }
        
        // Good title candidate: 5-100 chars, contains letters, not all numbers/symbols
        if (line.length >= 5 && line.length <= 100 && 
            line.match(/[a-zA-Z]/) && // Contains letters
            !line.match(/^[\d\s\-_*•]+$/) && // Not just numbers/symbols
            !line.match(/^[A-Z\s]+$/) && // Not all caps (likely a header)
            line.match(/[a-z]/)) { // Has lowercase (more likely to be a title)
            recipe.title = line;
            console.log('✅ Found title:', recipe.title);
            break;
        }
    }
    
    // Fallback: if no title found, try to extract from before Recipe/Ingredients
    if (!recipe.title || recipe.title.length < 5) {
        const beforeRecipe = text.split(/(?:recipe|ingredients?)\s*:?/i)[0];
        const titleLines = beforeRecipe.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of titleLines) {
            if (line.length >= 5 && line.length <= 100 && 
                line.match(/[a-zA-Z]/) && 
                !skipPatterns.some(pattern => line.match(pattern)) &&
                line.match(/[a-z]/)) {
                recipe.title = line;
                console.log('✅ Found title (fallback):', recipe.title);
                break;
            }
        }
    }
    
    // Split by Recipe: and Method: sections
    const recipeMatch = text.match(/recipe\s*:?\s*(.*?)(?=method|instructions?|directions?|steps?|$)/is);
    const methodMatch = text.match(/method\s*:?\s*(.*?)(?=recipe|nutrition|calories|serves|makes|yield|$)/is);
    
    // If Recipe: not found, try Ingredients:
    let ingredientsText = '';
    if (recipeMatch) {
        ingredientsText = recipeMatch[1];
    } else {
        const ingredientsMatch = text.match(/ingredients?\s*:?\s*(.*?)(?=method|instructions?|directions?|steps?|$)/is);
        if (ingredientsMatch) {
            ingredientsText = ingredientsMatch[1];
        }
    }
    
    // Parse ingredients - simple line-by-line
    if (ingredientsText) {
        const ingLines = ingredientsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const ingredientList = [];
        const subheadingPattern = /^(crumble\s+topping|filling|sauce|dressing|base|topping|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|for\s+the|\([^)]+\))(\s*:)?$/i;
        
        for (const line of ingLines) {
            // IMPORTANT: Stop collecting ingredients if we hit numbered instructions
            // This prevents instructions from being mixed into ingredients
            if (line.match(/^\d+\.\s+(preheat|bake|mix|add|stir|whisk|combine|dice|slice|chop|pour|transfer|sprinkle|line|scoop|let|serve|remove|place|set|heat|cook|roast|grill|fry|boil|simmer|on\s+a\s+pan|once)/i)) {
                console.log('⚠️ Stopping ingredient collection - hit instruction:', line.substring(0, 50));
                break; // Stop collecting ingredients when we hit instructions
            }
            
            // Check for subheadings (including parentheses format)
            const parenSubheading = line.match(/^\(([^)]+)\)\s*:?$/i);
            const isSubheading = line.match(subheadingPattern) || 
                                parenSubheading ||
                                (line.length < 50 && line.length > 2 && 
                                 !line.match(/^\d+/) && 
                                 !line.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml)/i) &&
                                 (line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*:)?$/) || line.match(/^[a-z]+(\s+[a-z]+)*(\s*:)?$/)));
            
            if (isSubheading) {
                let subheading = line.replace(/\s*:\s*$/, '').replace(/^\(|\)$/g, '').trim();
                if (parenSubheading) subheading = parenSubheading[1];
                ingredientList.push('\n' + subheading);
                console.log('✅ Found ingredient subheading:', subheading);
                continue;
            }
            
            // Skip section headers, hashtags, URLs, social media handles
            if (line.match(/^(recipe|method|instructions?|directions?|steps?)(\s*:)?$/i) ||
                line.match(/^[@#]/) || line.match(/^https?:\/\//) ||
                line.match(/^(follow|like|share|save|comment)/i)) {
                continue;
            }
            
            // Skip lines that are clearly instructions (numbered steps)
            if (line.match(/^\d+\.\s+/)) {
                console.log('⚠️ Skipping instruction line in ingredients:', line.substring(0, 50));
                break; // Stop - we've hit instructions
            }
            
            // Always include "Optional" lines
            if (line.match(/^optional/i)) {
                ingredientList.push('• ' + line);
                continue;
            }
            
            // Accept lines that look like ingredients - be very permissive
            if (line.match(/^\d+/) || // Starts with number
                line.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml|apples?|eggs?)/i) || // Has quantity + unit
                line.match(/^\d+\/\d+/) || // Has fraction
                line.match(/(sprinkle|drizzle|pinch|dash|optional)/i) || // Cooking/optional terms
                (line.length > 3 && line.length < 150 && !line.match(/^(if|when|then|follow|like|share)/i))) { // Reasonable length, not social media text
                ingredientList.push('• ' + line);
            }
        }
        
        recipe.ingredients = ingredientList.join('\n');
    }
    
    // Parse instructions - simple line-by-line
    let instructionsText = '';
    if (methodMatch) {
        instructionsText = methodMatch[1];
    } else {
        const instructionsMatch = text.match(/instructions?\s*:?\s*(.*?)(?=recipe|nutrition|calories|serves|makes|yield|$)/is);
        if (instructionsMatch) {
            instructionsText = instructionsMatch[1];
        }
    }
    
    // Fallback: if no Method/Instructions section found, look for numbered steps anywhere after Recipe/Ingredients
    if (!instructionsText || instructionsText.trim().length < 20) {
        console.log('⚠️ No instructions section found, searching for numbered steps...');
        // Find everything after Recipe/Ingredients section
        const afterIngredients = text.split(/(?:recipe|ingredients?)\s*:?/i).slice(1).join('\n');
        // Look for numbered steps in that text
        if (afterIngredients.match(/\d+\.\s+(preheat|bake|mix|add|stir|whisk|combine|dice|slice|chop|pour|transfer|sprinkle|line|scoop|let|serve|remove|place|set|heat|cook|roast|grill|fry|boil|simmer|on\s+a\s+pan|once)/i)) {
            // Extract from first numbered step to end (or nutrition section)
            const stepMatch = afterIngredients.match(/(\d+\.\s+.*?)(?=nutrition|calories|serves|makes|yield|$)/is);
            if (stepMatch) {
                instructionsText = stepMatch[1];
                console.log('✅ Found instructions by detecting numbered steps');
            }
        }
    }
    
    if (instructionsText) {
        const instLines = instructionsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const instructionList = [];
        let stepNum = 1;
        
        for (const line of instLines) {
            // Skip if it's clearly not an instruction
            if (line.match(/^(recipe|ingredients?|method|nutrition|calories|serves|makes|yield)(\s*:)?$/i) ||
                line.match(/^[@#]/) || line.match(/^https?:\/\//) ||
                line.match(/^(follow|like|share|save|comment|hashtag)/i)) {
                continue;
            }
            
            // Check if line starts with a number (numbered step)
            const numberedMatch = line.match(/^(\d+)\.\s*(.+)$/);
            if (numberedMatch) {
                instructionList.push(`${numberedMatch[1]}. ${numberedMatch[2]}`);
                stepNum = parseInt(numberedMatch[1]) + 1;
            } else {
                // Check if it's a continuation of previous step (starts with dash, hyphen, or is very short)
                if (line.match(/^[-•]\s*/) || (line.length < 20 && instructionList.length > 0)) {
                    // Append to last instruction, removing the dash
                    if (instructionList.length > 0) {
                        const lastInst = instructionList[instructionList.length - 1];
                        const continuation = line.replace(/^[-•]\s*/, '').trim();
                        instructionList[instructionList.length - 1] = lastInst + ' ' + continuation;
                    }
                } else if (line.length > 5) {
                    // New instruction step - check if it starts with instruction verbs or looks like an instruction
                    const isInstruction = line.match(/^(preheat|bake|mix|add|stir|whisk|combine|dice|slice|chop|pour|transfer|sprinkle|line|scoop|let|serve|remove|place|set|heat|cook|roast|grill|fry|boil|simmer|on\s+a\s+pan|once|to\s+a\s+bowl)/i) ||
                        (line.match(/^\d+/) && line.match(/(°|degrees?|fahrenheit|f|celsius|c|min|minutes?|hour|hours?|until|or)/i)) || // Temperature/time
                        (instructionList.length === 0 && line.length > 10); // First instruction, reasonable length
                    
                    if (isInstruction) {
                        instructionList.push(`${stepNum}. ${line}`);
                        stepNum++;
                    } else if (line.length > 15 && !line.match(/^(makes|serves|calories?|nutrition|macros?)/i)) {
                        // Long line that's not metadata - likely a step
                        instructionList.push(`${stepNum}. ${line}`);
                        stepNum++;
                    }
                }
            }
        }
        
        recipe.instructions = instructionList.join('\n\n');
    }
    
    // Try to extract servings and time
    const servingsMatch = text.match(/(?:servings?|serves|yield|makes)[:\s]*(\d+)/i);
    if (servingsMatch) {
        recipe.servings = parseInt(servingsMatch[1]);
    }
    
    recipe.minutes = extractTime(text);
    
    console.log('✅ Simple parser result:', {
        title: recipe.title.substring(0, 50),
        ingredientsCount: recipe.ingredients.split('\n').filter(l => l.trim()).length,
        instructionsCount: recipe.instructions.split('\n\n').filter(l => l.trim()).length
    });
    
    return recipe;
}

// ================================
// PARSE RECIPE TEXT (V3)
// ================================
function parseRecipeText(text) {
    console.log('🔍 Parsing recipe text (v3)...');
    
    // AGGRESSIVE CLEANING
    text = text.replace(/https?:\/\/[^\s]+/g, '');  // URLs
    text = text.replace(/_\s*print\/[^\s]+/g, '');  // Partial URLs
    text = text.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}[\s,]*\d{1,2}\s*:\s*\d{2}\s*[AP]M/gi, '');  // Timestamps
    text = text.replace(/Page\s+\d+\s+of\s+\d+/gi, '');  // Page numbers
    text = text.replace(/\d+\s+from\s+\d+\s+votes/gi, '');  // Votes
    
    
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\s{2,}/g, ' ');
    
    // Normalize fractions BEFORE parsing sections
    text = normalizeFractions(text);
    
    const recipe = {
        title: '',
        ingredients: '',
        instructions: '',
        servings: 0,
        minutes: 0,
        rating: 0
    };
    
    recipe.title = extractTitle(text);
    
    const servingsMatch = text.match(/(?:servings?|serves|yield|makes)[:\s]*(\d+)/i);
    if (servingsMatch) {
        recipe.servings = parseInt(servingsMatch[1]);
    }
    
    recipe.minutes = extractTime(text);
    
    const sections = identifySections(text);
    recipe.ingredients = sections.ingredients;
    recipe.instructions = sections.instructions;
    
    console.log('✅ Parsed recipe:', recipe);
    return recipe;
}

function extractTitle(text) {
    // Try to find title before metadata or section headers
    const beforeMetadata = text.split(/\s+(course|cuisine|keyword|prep time|cook time|total time|servings|calories|author|ingredients?|recipe|instructions?|method|directions?)\s*:/i)[0];
    
    // Look for title patterns - first substantial line that's not empty
    const lines = beforeMetadata.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
        // Skip common non-title patterns
        if (line.match(/^(ingredients?|recipe|instructions?|method|directions?|steps?|prep|cook|total|servings?|calories?|author|course|cuisine|keyword)/i)) {
            continue;
        }
        
        // Skip very short lines
        if (line.length < 3) continue;
        
        // Skip lines that are just numbers or special chars
        if (line.match(/^[\d\s\-_*•]+$/)) continue;
        
        // Skip URLs
        if (line.match(/^https?:\/\//)) continue;
        
        // Skip lines that look like hashtags or mentions
        if (line.match(/^[@#]/)) continue;
        
        // Good title candidate: 3-100 chars, not all caps (unless very short), contains letters
        if (line.length >= 3 && line.length <= 100 && line.match(/[a-zA-Z]/)) {
            // Prefer title case or mixed case over all caps (unless it's short)
            if (line.length < 20 || !line.match(/^[A-Z\s]+$/)) {
                return line;
            }
        }
    }
    
    // Fallback: try original method
    const titleMatch = beforeMetadata.match(/^([^.!?]{3,80}?)(?:\s+this|\s+is|\s+are|$)/i);
    if (titleMatch) {
        const title = titleMatch[1].trim();
        if (title.length >= 3 && title.length < 100 && !title.match(/^(ingredients?|instructions?|method)$/i)) {
            return title;
        }
    }
    
    return 'Untitled Recipe';
}

function extractTime(text) {
    const totalTimeMatch = text.match(/total\s+time[:\s]*(\d+)\s*(?:min|minute)/i);
    if (totalTimeMatch) return parseInt(totalTimeMatch[1]);
    
    const prepMatch = text.match(/prep\s+time[:\s]*(\d+)\s*(?:min|minute)/i);
    const cookMatch = text.match(/cook\s+time[:\s]*(\d+)\s*(?:min|minute)/i);
    if (prepMatch && cookMatch) return parseInt(prepMatch[1]) + parseInt(cookMatch[1]);
    if (cookMatch) return parseInt(cookMatch[1]);
    if (prepMatch) return parseInt(prepMatch[1]);
    
    return 0;
}

// ================================
// SPLIT MULTIPLE INGREDIENTS ON SAME LINE
// ================================
function splitMultipleIngredients(line) {
    // Pattern to detect start of new ingredient: quantity (with optional fraction) + unit
    // Look for pattern like: "1 teaspoon", "1/2 cup", "2 1/2 cups"
    const quantityUnitPattern = /\s+(\d+(?:\s+\d+\/\d+)?\s*(?:cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)\s+)/gi;
    
    const splits = [];
    let lastIndex = 0;
    let match;
    let matchCount = 0;
    
    // Find all matches
    const matches = [];
    while ((match = quantityUnitPattern.exec(line)) !== null) {
        matches.push({ index: match.index, text: match[1] });
        matchCount++;
    }
    
    // If we found 2+ quantity+unit patterns, split on them
    if (matchCount > 1) {
        for (let i = 0; i < matches.length; i++) {
            const start = i === 0 ? 0 : matches[i].index;
            const end = i < matches.length - 1 ? matches[i + 1].index : line.length;
            const ingredient = line.substring(start, end).trim();
            if (ingredient) {
                splits.push(ingredient);
            }
        }
        return splits.length > 0 ? splits : [line.trim()];
    }
    
    // Single ingredient or no pattern match
    return [line.trim()];
}

function identifySections(text) {
    console.log('🔍 Identifying sections in text, length:', text.length);
    
    // More flexible matching: "Recipe:" can mean ingredients, "Method:" can mean instructions
    // Try multiple patterns to find ingredients section
    let ingredientsMatch = text.match(/ingredients?\s*:?\s*(.*?)(?=instructions|directions|method|steps|preparation|recipe|$)/is);
    
    // Fallback: look for "Recipe:" as ingredients section
    if (!ingredientsMatch) {
        ingredientsMatch = text.match(/recipe\s*:?\s*(.*?)(?=method|instructions|directions|steps|preparation|$)/is);
    }
    
    // Another fallback: look for lines that start with quantities (likely ingredients)
    if (!ingredientsMatch) {
        // Find text before instructions that contains ingredient-like patterns
        const beforeInstructions = text.split(/(?:instructions|directions|method|steps|preparation)/i)[0];
        if (beforeInstructions && beforeInstructions.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml|apples?|eggs?)/i)) {
            ingredientsMatch = [null, beforeInstructions];
            console.log('✅ Found ingredients by pattern matching');
        }
    }
    
    // Last resort: if we can't find a clear section, try to extract ingredients from the whole text
    if (!ingredientsMatch) {
        // Look for ingredient patterns throughout the text
        const lines = text.split('\n');
        const ingredientLines = [];
        let foundRecipeHeader = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Check if this looks like a recipe/ingredients header
            if (line.match(/^(recipe|ingredients?)(\s*:)?$/i)) {
                foundRecipeHeader = true;
                continue;
            }
            
            // If we found a header or see ingredient patterns, collect lines
            if (foundRecipeHeader || line.match(/^\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml|apples?|eggs?|tablespoon)/i)) {
                // Stop if we hit instructions
                if (line.match(/^(method|instructions?|directions?|steps?)(\s*:)?$/i)) {
                    break;
                }
                ingredientLines.push(line);
            }
        }
        
        if (ingredientLines.length > 0) {
            ingredientsMatch = [null, ingredientLines.join('\n')];
            console.log('✅ Found ingredients by scanning lines, count:', ingredientLines.length);
        }
    }
    
    console.log('🔍 Ingredients match found:', !!ingredientsMatch);
    
    let ingredients = '';
    
    if (ingredientsMatch) {
        let ingText = ingredientsMatch[1];
        
        // First, fix fractions that might be split across lines or spaces by OCR
        // Pattern: "1/" followed by space/newline then "3" -> "1/3"
        ingText = ingText.replace(/(\d+\/)\s+(\d+)/g, '$1$2');
        // Also handle: "2 1/" followed by space/newline then "2" -> "2 1/2"
        ingText = ingText.replace(/(\d+\s+\d+\/)\s+(\d+)/g, '$1$2');
        // Handle cases where fraction is split with newline: "1/\n3" -> "1/3"
        ingText = ingText.replace(/(\d+\/)\s*\n\s*(\d+)/g, '$1$2');
        ingText = ingText.replace(/(\d+\s+\d+\/)\s*\n\s*(\d+)/g, '$1$2');
        
        // First, protect fractions by temporarily replacing them with placeholders
        // This prevents splitting in the middle of fractions
        const fractionPlaceholders = new Map();
        let placeholderIndex = 0;
        
        // Replace fractions with placeholders: "1/3" -> "__FRAC_0__", "2 1/2" -> "2 __FRAC_1__"
        // This protects them from being split incorrectly
        // Handle various spacing: "1/3", "1/ 3", "2 1/2", "2 1/ 2"
        ingText = ingText.replace(/(\d+\s+)?\d+\/\s*\d+/g, (match) => {
            // Normalize spacing in the fraction (remove extra spaces around /)
            const normalized = match.replace(/\s*\/\s*/, '/');
            const placeholder = `__FRAC_${placeholderIndex}__`;
            fractionPlaceholders.set(placeholder, normalized);
            placeholderIndex++;
            return placeholder;
        });
        
        // Now split on newlines OR before a quantity (whole number or fraction placeholder) followed by unit
        // Important: Only split when we see a clear start of a new ingredient (quantity+unit at word boundary)
        // Pattern: split before "__FRAC_X__" or digit when followed by unit, but ensure it's at a word boundary
        // Use word boundary to avoid splitting mid-word
        const lines = ingText.split(/(?:\n|(?=\s+(?:__FRAC_\d+__|\d+)\s+(?:cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)\b))/i);
        const ingredientLines = [];
        
        for (const line of lines) {
            let trimmed = line.trim();
            if (!trimmed) continue;
            
            // Restore fractions from placeholders before processing
            for (const [placeholder, fraction] of fractionPlaceholders.entries()) {
                trimmed = trimmed.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fraction);
            }
            
            // Detect ingredient subheadings - more flexible pattern
            // Check for subheadings in parentheses: "(Brownie)", "(Pistachio Filling)", etc.
            const parenSubheading = trimmed.match(/^\(([^)]+)\)\s*:?$/i);
            
            // Check for common subheading patterns
            const subheadingPattern = /^(crumble\s+topping|prepare\s+filling|prepare\s+topping|filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|assembly|decorating|icing|frosting|for\s+the|ingredients?\s+for|for\s+the\s+\w+|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i;
            const subheadingMatch = trimmed.match(subheadingPattern);
            
            // Check if line STARTS with a subheading (even if ingredients follow)
            const startsWithSubheading = trimmed.match(/^(crumble\s+topping|prepare\s+filling|prepare\s+topping|filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|ingredients?\s+for|for\s+the\s+\w+)(\s*:)?(\s|$)/i);
            
            // Check if line is JUST a subheading word
            const isSingleWordSubheading = trimmed.match(/^(filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i);
            
            // Check if line looks like a subheading: short line, no numbers/quantities, title case or all caps
            const looksLikeSubheading = trimmed.length > 2 &&
                                       trimmed.length < 60 &&
                                       !trimmed.match(/^\d+/) && 
                                       !trimmed.match(/^\d+\/\d+/) &&
                                       !trimmed.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml)/i) &&
                                       (trimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*:)?$/) || 
                                        trimmed.match(/^[A-Z\s]+(\s*:)?$/) || // All caps
                                        trimmed.match(/^[a-z]+(\s+[a-z]+)*(\s*:)?$/) || // All lowercase
                                        trimmed.match(subheadingPattern));
            
            if (parenSubheading || subheadingMatch || looksLikeSubheading || startsWithSubheading || isSingleWordSubheading) {
                // Extract just the subheading part
                let subheading = trimmed;
                if (parenSubheading) {
                    subheading = parenSubheading[1].trim(); // Extract text from parentheses
                } else if (isSingleWordSubheading) {
                    subheading = isSingleWordSubheading[1];
                } else if (startsWithSubheading) {
                    subheading = startsWithSubheading[1];
                    // Remove the subheading from the line and process remaining as ingredients
                    const remainingText = trimmed.substring(startsWithSubheading[0].length).trim();
                    if (remainingText) {
                        // Process remaining text as ingredients
                        const splitIngredients = splitMultipleIngredients(remainingText);
                        for (const ing of splitIngredients) {
                            const ingTrimmed = ing.trim();
                            if (!ingTrimmed) continue;
                            if (ingTrimmed.match(/^[\d•\-*☆★]/) || 
                                ingTrimmed.match(/^(\d+\s+)?\d+\/\d+\s*(cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)/i) ||
                                ingTrimmed.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)/i)) {
                                ingredientLines.push('• ' + ingTrimmed);
                            }
                        }
                    }
                } else if (subheadingMatch) {
                    subheading = subheadingMatch[1];
                } else {
                    subheading = trimmed.replace(/\s*:\s*$/, '').replace(/^\(|\)$/g, ''); // Remove colons and parentheses
                }
                ingredientLines.push('\n' + subheading);
                console.log('✅ Found ingredient subheading:', subheading);
                continue;
            }
            
            // Check if line contains multiple ingredients and split them
            const splitIngredients = splitMultipleIngredients(trimmed);
            
            for (const ing of splitIngredients) {
                const ingTrimmed = ing.trim();
                if (!ingTrimmed) continue;
                
                // Check again for subheadings after splitting (in case subheading was on same line as ingredients)
                const subheadingMatchAfterSplit = ingTrimmed.match(subheadingPattern);
                const looksLikeSubheadingAfterSplit = ingTrimmed.length > 2 &&
                                                     ingTrimmed.length < 50 &&
                                                     !ingTrimmed.match(/^\d+/) && 
                                                     !ingTrimmed.match(/^\d+\/\d+/) &&
                                                     !ingTrimmed.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml)/i) &&
                                                     (ingTrimmed.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*:)?$/) || 
                                                      ingTrimmed.match(/^[a-z]+(\s+[a-z]+)*(\s*:)?$/) ||
                                                      ingTrimmed.match(subheadingPattern));
                
                if (subheadingMatchAfterSplit || looksLikeSubheadingAfterSplit) {
                    const subheading = ingTrimmed.replace(/\s*:\s*$/, '');
                    ingredientLines.push('\n' + subheading);
                    console.log('✅ Found ingredient subheading after split:', subheading);
                    continue;
                }
                
                // Match lines that start with numbers, fractions, or bullets
                // Also match lines with quantities (including fractions) followed by units
                // Be more lenient for OCR text - accept lines that look like ingredients
                const looksLikeIngredient = ingTrimmed.match(/^[\d•\-*☆★]/) || 
                    ingTrimmed.match(/^(\d+\s+)?\d+\/\d+\s*(cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)/i) ||
                    ingTrimmed.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|teaspoons|tablespoon|tablespoons|pound|pounds|lb|lbs|oz|ounce|ounces|g|kg|ml)/i) ||
                    // Also accept lines starting with numbers followed by common food words (for OCR)
                    ingTrimmed.match(/^\d+\s+(apples?|eggs?|tablespoons?|teaspoons?|cups?|tbsp|tsp|pounds?|lbs?|oz|ounces?|cinnamon|oats?|flour|sugar|butter|oil|salt|pepper|vanilla)/i) ||
                    // Accept lines with fractions (even without units)
                    ingTrimmed.match(/^\d+\/\d+/) ||
                    // Accept lines that are short and contain common ingredient words
                    (ingTrimmed.length < 80 && ingTrimmed.match(/(apples?|eggs?|flour|sugar|butter|oil|cinnamon|oats?|salt|pepper|vanilla|baking|powder)/i));
                
                if (looksLikeIngredient) {
                    ingredientLines.push('• ' + ingTrimmed);
                } else {
                    console.log('⚠️ Skipped line (doesn\'t look like ingredient):', ingTrimmed.substring(0, 50));
                }
            }
        }
        
        ingredients = ingredientLines.join('\n');
    }
    
    // Match instructions section - be more flexible with the end boundary
    // Try multiple patterns to find instructions - "Method:" is common in OCR text
    let instructionsMatch = text.match(/(?:instructions?|directions?|method|steps?|preparation)\s*:?\s*(.*?)(?=\n\s*(?:nutrition|serves|makes|yield|calories|total\s+time|prep\s+time|cook\s+time|$))/is);
    
    // Fallback 1: if no match, try matching everything after "instructions" to the end
    if (!instructionsMatch) {
        instructionsMatch = text.match(/(?:instructions?|directions?|method|steps?|preparation)\s*:?\s*(.*)$/is);
    }
    
    // Fallback 2: try case-insensitive and more flexible
    if (!instructionsMatch) {
        instructionsMatch = text.match(/instructions?\s*:?\s*(.*)$/im);
    }
    
    // Fallback 3: look for numbered steps anywhere after ingredients/recipe section
    if (!instructionsMatch) {
        // Find text after ingredients that contains numbered steps
        const afterIngredients = text.split(/(?:ingredients?|recipe)\s*:?/i).slice(1).join(' ').split(/(?:nutrition|calories|serves|makes)/i)[0];
        if (afterIngredients && afterIngredients.match(/\d+\.\s+/)) {
            instructionsMatch = [null, afterIngredients];
            console.log('📝 Found instructions by detecting numbered steps after ingredients');
        }
    }
    
    // Fallback 4: scan line by line for instructions after "Method:" or "Recipe:" section
    if (!instructionsMatch) {
        const lines = text.split('\n');
        const instructionLines = [];
        let foundMethodHeader = false;
        let foundRecipeSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Check if we've seen Recipe: section (ingredients come first)
            if (line.match(/^(recipe|ingredients?)(\s*:)?$/i)) {
                foundRecipeSection = true;
                continue;
            }
            
            // Check if this is Method: header
            if (line.match(/^(method|instructions?|directions?|steps?)(\s*:)?$/i)) {
                foundMethodHeader = true;
                continue;
            }
            
            // If we found method header OR we're past recipe section and see instruction-like content
            if (foundMethodHeader || (foundRecipeSection && (line.match(/^\d+\./) || line.match(/^(preheat|bake|mix|add|stir|whisk|combine|pour|transfer|sprinkle|let|serve)/i)))) {
                // Stop at nutrition/metadata
                if (line.match(/^(nutrition|calories|serves|makes|yield|hashtag|#|@)/i)) {
                    break;
                }
                instructionLines.push(line);
            }
        }
        
        if (instructionLines.length > 0) {
            instructionsMatch = [null, instructionLines.join('\n')];
            console.log('✅ Found instructions by scanning lines, count:', instructionLines.length);
        }
    }
    
    console.log('🔍 Instructions match found:', !!instructionsMatch);
    if (instructionsMatch) {
        console.log('📝 Instructions text preview:', instructionsMatch[1].substring(0, 200));
    }
    
    let instructions = '';
    
    if (instructionsMatch) {
        let instText = instructionsMatch[1].trim();
        
        console.log('📝 Instructions text found, length:', instText.length);
        console.log('📄 First 500 chars:', instText.substring(0, 500));
        
        // Normalize line breaks and clean up
        instText = instText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        instText = instText.replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
        
        // Process line by line to maintain order and context
        const lines = instText.split(/\n/);
        const instructionParts = [];
        // Updated pattern to include common instruction subheadings
        const subheadingPattern = /^(crumble\s+topping|prepare\s+filling|prepare\s+topping|filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|assembly|decorating|icing|frosting|for\s+the|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i;
        const seenStepKeys = new Set();
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            
            // Skip nutrition and other metadata
            if (line.match(/^(nutrition|calories|serves|makes|yield|total\s+time|prep\s+time|cook\s+time)/i)) {
                break;
            }
            
            // Check if this line is a subheading - use same flexible pattern as ingredients
            // Check for subheadings in parentheses: "(Brownie)", "(Pistachio Filling)", etc.
            const parenSubheading = line.match(/^\(([^)]+)\)\s*:?$/i);
            
            // Updated pattern to include common instruction subheadings
            const subheadingPattern = /^(crumble\s+topping|prepare\s+filling|prepare\s+topping|filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|assembly|decorating|icing|frosting|for\s+the|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i;
            const subheadingMatch = line.match(subheadingPattern);
            const isSingleWord = line.match(/^(filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i);
            const looksLikeSubheading = line.length < 60 && 
                                       line.length > 2 &&
                                       !line.match(/^\d+\./) && 
                                       !line.match(/^\d+\s/) &&
                                       !line.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml)/i) &&
                                       (line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*(\s*:)?$/) || 
                                        line.match(/^[A-Z\s]+(\s*:)?$/) || // All caps
                                        line.match(/^[a-z]+(\s+[a-z]+)*(\s*:)?$/) || // All lowercase
                                        line.match(subheadingPattern));
            
            if (parenSubheading || subheadingMatch || isSingleWord || looksLikeSubheading) {
                let subheading = line.replace(/\s*:\s*$/, '').trim();
                if (parenSubheading) {
                    subheading = parenSubheading[1].trim(); // Extract text from parentheses
                } else if (isSingleWord) {
                    subheading = isSingleWord[1];
                } else if (subheadingMatch) {
                    subheading = subheadingMatch[1];
                } else {
                    subheading = subheading.replace(/^\(|\)$/g, ''); // Remove parentheses if present
                }
                
                instructionParts.push('\n' + subheading);
                console.log('✅ Found instruction subheading:', subheading);
                continue;
            }
            
            // Look for numbered steps
            const stepMatch = line.match(/^(\d+)\.\s*(.+)$/);
            if (stepMatch) {
                const stepNum = stepMatch[1];
                let stepText = stepMatch[2].trim();
                
                // Collect continuation lines (until next step, subheading, or empty line followed by step/subheading)
                let j = i + 1;
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    if (!nextLine) {
                        // Check if next non-empty line is a step or subheading
                        let k = j + 1;
                        while (k < lines.length && !lines[k].trim()) k++;
                        if (k < lines.length) {
                            const peekLine = lines[k].trim();
                            const peekParenSubheading = peekLine.match(/^\(([^)]+)\)\s*:?$/i);
                            const peekSubheadingMatch = peekLine.match(subheadingPattern);
                            const peekIsSingleWord = peekLine.match(/^(filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i);
                            if (peekLine.match(/^\d+\./) || peekParenSubheading || peekSubheadingMatch || peekIsSingleWord ||
                                peekLine.match(/^(nutrition|calories)/i)) {
                                break;
                            }
                        }
                        j++;
                        continue;
                    }
                        // Stop at next numbered step or subheading
                        const nextParenSubheading = nextLine.match(/^\(([^)]+)\)\s*:?$/i);
                        const nextSubheadingMatch = nextLine.match(subheadingPattern);
                        const nextIsSingleWord = nextLine.match(/^(filling|topping|sauce|dressing|base|glaze|frosting|dough|crust|batter|marinade|rub|seasoning|garnish|recipe|method|instructions?|directions?|steps?)(\s*:)?$/i);
                        if (nextLine.match(/^\d+\./) || nextParenSubheading || nextSubheadingMatch || nextIsSingleWord ||
                            nextLine.match(/^(nutrition|calories)/i)) {
                            break;
                        }
                    // Skip ingredient lists that appear in instructions (lines with measurements)
                    if (nextLine.match(/\d+\s*(cup|cups|tbsp|tsp|teaspoon|tablespoon|pound|lb|oz|ounce|g|kg|ml)/i)) {
                        j++;
                        continue; // Skip ingredient lines in instructions
                    }
                    stepText += ' ' + nextLine;
                    j++;
                }
                i = j - 1;
                
                // Clean up step text
                stepText = stepText.replace(/\s+/g, ' ').trim();
                
                // Check for duplicates - only skip if identical
                const stepKey = `${stepNum}:${stepText.substring(0, 50).toLowerCase()}`;
                if (seenStepKeys.has(stepKey)) {
                    console.log('⚠️ Skipping duplicate step:', stepNum);
                    continue;
                }
                seenStepKeys.add(stepKey);
                
                instructionParts.push(`${stepNum}. ${stepText}`);
                console.log('✅ Found step', stepNum, '-', stepText.substring(0, 60));
            }
        }
        
        if (instructionParts.length > 0) {
            instructions = instructionParts.join('\n\n');
            console.log('✅ Successfully parsed', instructionParts.length, 'instruction parts');
        } else {
            console.log('⚠️ No steps found, trying regex fallback...');
            // Fallback: try regex method
            const steps = instText.match(/\d+\.\s*[^]+?(?=\d+\.|$)/g);
            if (steps && steps.length > 0) {
                const parts = [];
                for (const step of steps) {
                    const trimmed = step.trim();
                    const match = trimmed.match(/^(\d+)\.\s*(.+)$/s);
                    if (match) {
                        parts.push(`${match[1]}. ${match[2].trim().replace(/\s+/g, ' ')}`);
                    }
                }
                instructions = parts.join('\n\n');
            } else {
                instructions = instText.trim();
            }
        }
    } else {
        console.log('⚠️ No instructions section found in text');
        // Try to find any numbered steps anywhere in the text as last resort
        const anySteps = text.match(/\d+\.\s*[^]+?(?=\d+\.|$)/g);
        if (anySteps && anySteps.length > 0) {
            console.log('📝 Found', anySteps.length, 'numbered steps elsewhere in text');
            instructions = anySteps.map(s => s.trim()).join('\n\n');
        }
    }
    
    // Final cleanup
    ingredients = ingredients.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}[\s,]*\d{1,2}\s*:\s*\d{2}\s*[AP]M/gi, '').replace(/_\s*print\/[^\s]+/g, '').trim();
    instructions = instructions.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}[\s,]*\d{1,2}\s*:\s*\d{2}\s*[AP]M/gi, '').replace(/_\s*print\/[^\s]+/g, '').trim();
    
    return {
        ingredients: ingredients || 'No ingredients found',
        instructions: instructions || 'No instructions found'
    };
}

// ================================
// COMPRESS IMAGE
// ================================
async function compressImage(base64Data, maxSizeKB = 1000) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const maxDimension = 1200;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = (height / width) * maxDimension;
                    width = maxDimension;
                } else {
                    width = (width / height) * maxDimension;
                    height = maxDimension;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            let quality = 0.9;
            let compressed = canvas.toDataURL('image/jpeg', quality);
            
            while (compressed.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
                quality -= 0.1;
                compressed = canvas.toDataURL('image/jpeg', quality);
            }
            
            resolve(compressed);
        };
        img.onerror = reject;
        img.src = base64Data;
    });
}

// ================================
// POPULATE RECIPE FORM
// ================================
async function populateRecipeForm(parsedData) {
    console.log('📝 Populating form with:', parsedData);
    
    const titleInput = document.getElementById('recipe-name');
    if (titleInput && parsedData.title) {
        titleInput.value = parsedData.title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Title:', parsedData.title);
    }
    
    const servingsInput = document.getElementById('recipe-servings');
    if (servingsInput && parsedData.servings) {
        servingsInput.value = parsedData.servings;
        servingsInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Servings:', parsedData.servings);
    }
    
    const minutesInput = document.getElementById('recipe-minutes');
    if (minutesInput && parsedData.minutes) {
        minutesInput.value = parsedData.minutes;
        minutesInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Minutes:', parsedData.minutes);
    }
    
    const ingredientsTextarea = document.getElementById('recipe-ingredients');
    if (ingredientsTextarea && parsedData.ingredients) {
        ingredientsTextarea.value = parsedData.ingredients;
        ingredientsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Ingredients:', parsedData.ingredients.length, 'chars');
    }
    
    const instructionsTextarea = document.getElementById('recipe-instructions');
    if (instructionsTextarea && parsedData.instructions) {
        instructionsTextarea.value = parsedData.instructions;
        instructionsTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Instructions:', parsedData.instructions.length, 'chars');
    }
    
    if (parsedData.imageData) {
        const compressed = await compressImage(parsedData.imageData);
        const coverImagePreview = document.getElementById('cover-image-preview');
        if (coverImagePreview) {
            coverImagePreview.src = compressed;
            coverImagePreview.classList.add('has-image');
            coverImagePreview.style.display = 'block';
            console.log('✅ Image set');
        }
    }
    
    console.log('✅ Form populated');
}

// ================================
// UI HELPERS
// ================================
function showLoadingIndicator(message) {
    let loader = document.getElementById('recipe-upload-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'recipe-upload-loader';
        loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100000;';
        loader.innerHTML = `<div style="background:white;padding:40px;border-radius:16px;text-align:center;">
            <div style="width:50px;height:50px;margin:0 auto;border:4px solid #f3f3f3;border-top:4px solid #667eea;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <p style="margin-top:20px;font-size:16px;color:#333;font-weight:500;">${message}</p>
        </div>`;
        document.body.appendChild(loader);
        
        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }
    loader.style.display = 'flex';
}

function hideLoadingIndicator() {
    const loader = document.getElementById('recipe-upload-loader');
    if (loader) loader.style.display = 'none';
}

function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:16px 32px;border-radius:12px;font-size:15px;font-weight:600;box-shadow:0 10px 40px rgba(16,185,129,0.3);z-index:100001;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ================================
// INITIALIZE
// ================================
function initRecipeUpload() {
    console.log('🔧 Initializing recipe upload...');
    
    const fileInput = document.getElementById('recipe-file-input');
    if (!fileInput) {
        console.error('❌ recipe-file-input not found!');
        return;
    }
    
    console.log('✅ File input found');
    
    fileInput.addEventListener('change', async (e) => {
        console.log('🚨 FILE CHANGE EVENT FIRED!');
        const file = e.target.files[0];
        if (!file) {
            console.log('⚠️ No file selected');
            return;
        }
        
        console.log('📁 File selected:', file.name, file.type, file.size, 'bytes');
        
        try {
            showLoadingIndicator('Processing recipe...');
            
            const parsedData = await handleRecipeFileUpload(file);
            
            if (typeof openSidePanel === 'function') {
                openSidePanel('recipe');
                console.log('✅ Side panel opened');
            } else {
                console.error('❌ openSidePanel not found');
            }
            
            setTimeout(async () => {
                await populateRecipeForm(parsedData);
                hideLoadingIndicator();
                showSuccessMessage('Recipe imported successfully!');
            }, 500);
            
        } catch (error) {
            console.error('❌ Error:', error);
            hideLoadingIndicator();
            alert('Error importing recipe: ' + error.message);
        }
        
        e.target.value = '';
    });
    
    console.log('✅ Recipe upload initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRecipeUpload);
} else {
    initRecipeUpload();
}

console.log('✅ Recipe Parser Module Loaded');