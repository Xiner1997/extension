// 存储高亮文本的数组
let highlights = [];

// 检查高亮是否重叠
function checkHighlightOverlap(text, range) {
    const highlightElements = document.querySelectorAll('.highlight-text');
    const overlappingHighlights = [];
    
    for (const element of highlightElements) {
        const elementRange = document.createRange();
        elementRange.selectNodeContents(element);
        
        // 检查范围是否重叠
        if (range.compareBoundaryPoints(Range.START_TO_END, elementRange) > 0 &&
            range.compareBoundaryPoints(Range.END_TO_START, elementRange) < 0) {
            overlappingHighlights.push({
                element: element,
                text: element.dataset.originalText || element.textContent
            });
        }
    }
    
    return overlappingHighlights;
}

// 合并重叠的高亮
function mergeOverlappingHighlights(overlappingHighlights) {
    if (overlappingHighlights.length === 0) return null;
    
    // 找出最长的文本
    let longestText = overlappingHighlights[0].text;
    let longestElement = overlappingHighlights[0].element;
    
    for (const highlight of overlappingHighlights) {
        if (highlight.text.length > longestText.length) {
            longestText = highlight.text;
            longestElement = highlight.element;
        }
    }
    
    // 删除其他重叠的高亮
    for (const highlight of overlappingHighlights) {
        if (highlight.element !== longestElement) {
            // 从DOM中移除
            const textNode = document.createTextNode(highlight.text);
            highlight.element.parentNode.replaceChild(textNode, highlight.element);
            
            // 从存储中移除
            highlights = highlights.filter(h => h.id !== highlight.element.id);
        }
    }
    
    return longestElement;
}

// 从存储中加载高亮数据
function loadHighlights() {
    try {
        chrome.storage.local.get(['highlights'], function(result) {
            if (result.highlights) {
                highlights = result.highlights;
                // 只加载当前页面的高亮
                const currentUrl = window.location.href;
                const currentPageHighlights = highlights.filter(h => h.url === currentUrl);
                
                // 使用 setTimeout 来避免阻塞主线程
                setTimeout(() => {
                    applyHighlights(currentPageHighlights);
                }, 0);
            }
        });
    } catch (e) {
        console.warn('加载高亮失败，可能是扩展上下文失效:', e);
    }
}

// 应用高亮到页面
function applyHighlights(highlightsToApply) {
    if (!highlightsToApply || highlightsToApply.length === 0) return;
    
    // 使用 Map 来存储文本节点和它们的内容
    const textNodes = new Map();
    
    // 第一次遍历：收集所有文本节点
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
            textNodes.set(node, node.textContent);
        }
    }
    
    // 分批处理高亮，避免一次性处理太多导致卡顿
    const batchSize = 10;
    let currentBatch = 0;
    
    function processBatch() {
        const start = currentBatch * batchSize;
        const end = Math.min(start + batchSize, highlightsToApply.length);
        const batch = highlightsToApply.slice(start, end);
        
        batch.forEach(highlight => {
            try {
                // 创建高亮元素
                const span = document.createElement('span');
                span.className = 'highlight-text';
                span.id = highlight.id;
                span.style.cssText = `
                    background-color: #ffff00;
                    cursor: pointer;
                    display: inline;
                    padding: 0;
                    margin: 0;
                    border-radius: 2px;
                `;
                span.dataset.originalText = highlight.text;
                span.dataset.highlightId = highlight.id;
                
                // 处理跨段落高亮
                if (highlight.range && highlight.range.startContainer && highlight.range.endContainer) {
                    // 查找开始和结束节点
                    const startNode = findNodeByRangeInfo(highlight.range.startContainer);
                    const endNode = findNodeByRangeInfo(highlight.range.endContainer);
                    
                    if (startNode && endNode) {
                        // 获取所有需要高亮的节点
                        const nodesToHighlight = [];
                        const walker = document.createTreeWalker(
                            document.body,
                            NodeFilter.SHOW_TEXT,
                            null,
                            false
                        );
                        
                        let currentNode;
                        let foundStart = false;
                        
                        while (currentNode = walker.nextNode()) {
                            if (currentNode === startNode) {
                                foundStart = true;
                            }
                            if (foundStart) {
                                nodesToHighlight.push(currentNode);
                                if (currentNode === endNode) {
                                    break;
                                }
                            }
                        }
                        
                        // 处理每个需要高亮的节点
                        nodesToHighlight.forEach((node, index) => {
                            const nodeSpan = span.cloneNode(true);
                            
                            if (index === 0) {
                                // 处理开始节点
                                const startText = node.textContent;
                                const startIndex = highlight.range.startOffset;
                                nodeSpan.textContent = startText.substring(startIndex);
                                
                                const startTextNode = document.createTextNode(startText.substring(0, startIndex));
                                const parent = node.parentNode;
                                parent.insertBefore(startTextNode, node);
                                parent.insertBefore(nodeSpan, startTextNode.nextSibling);
                                parent.removeChild(node);
                            } else if (index === nodesToHighlight.length - 1) {
                                // 处理结束节点
                                const endText = node.textContent;
                                const endIndex = highlight.range.endOffset;
                                nodeSpan.textContent = endText.substring(0, endIndex);
                                
                                const endTextNode = document.createTextNode(endText.substring(endIndex));
                                const parent = node.parentNode;
                                parent.insertBefore(nodeSpan, node);
                                parent.insertBefore(endTextNode, nodeSpan.nextSibling);
                                parent.removeChild(node);
                            } else {
                                // 处理中间节点
                                nodeSpan.textContent = node.textContent;
                                const parent = node.parentNode;
                                parent.insertBefore(nodeSpan, node);
                                parent.removeChild(node);
                            }
                        });
                    }
                } else {
                    // 单段落高亮
                    const matchingNodes = [];
                    textNodes.forEach((text, node) => {
                        if (text.includes(highlight.text)) {
                            matchingNodes.push(node);
                        }
                    });
                    
                    if (matchingNodes.length > 0) {
                        matchingNodes.forEach(node => {
                            const text = node.textContent;
                            const startIndex = text.indexOf(highlight.text);
                            
                            if (startIndex !== -1) {
                                const nodeSpan = span.cloneNode(true);
                                nodeSpan.textContent = highlight.text;
                                
                                const startTextNode = document.createTextNode(text.substring(0, startIndex));
                                const endTextNode = document.createTextNode(text.substring(startIndex + highlight.text.length));
                                
                                const parent = node.parentNode;
                                parent.insertBefore(startTextNode, node);
                                parent.insertBefore(nodeSpan, startTextNode.nextSibling);
                                parent.insertBefore(endTextNode, nodeSpan.nextSibling);
                                parent.removeChild(node);
                            }
                        });
                    }
                }
            } catch (e) {
                console.error('高亮应用失败:', e);
            }
        });
        
        currentBatch++;
        
        // 如果还有更多批次，继续处理
        if (currentBatch * batchSize < highlightsToApply.length) {
            setTimeout(processBatch, 0);
        } else {
            // 所有批次处理完成后，添加事件监听器
            addHighlightClickListeners();
        }
    }
    
    // 开始处理第一批
    processBatch();
}

// 添加高亮点击事件监听器
function addHighlightClickListeners() {
    const highlightElements = document.querySelectorAll('.highlight-text');
    highlightElements.forEach(element => {
        // 移除旧的事件监听器（如果有的话）
        element.removeEventListener('click', handleHighlightClick);
        // 添加新的事件监听器
        element.addEventListener('click', handleHighlightClick);
    });
}

// 处理高亮点击事件
function handleHighlightClick(event) {
    try {
        const highlightId = event.target.dataset.highlightId || event.target.id;
        chrome.runtime.sendMessage({
            type: 'HIGHLIGHT_CLICKED',
            highlightId: highlightId
        });
    } catch (e) {
        console.warn('发送消息失败，可能是扩展上下文失效:', e);
    }
}

// 根据范围信息查找节点
function findNodeByRangeInfo(rangeInfo) {
    if (!rangeInfo || !rangeInfo.parentNode) return null;
    
    const { nodeName, className, id } = rangeInfo.parentNode;
    let selector = nodeName.toLowerCase();
    
    if (id) {
        selector += `#${id}`;
    }
    if (className) {
        selector += `.${className.split(' ').join('.')}`;
    }
    
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
                textNodes.push(node);
            }
        }
        
        for (const node of textNodes) {
            if (node.textContent === rangeInfo.nodeValue) {
                return node;
            }
        }
    }
    
    return null;
}

// 高亮文本的函数
function highlightText(text, highlightId, range) {
    if (!range) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        range = selection.getRangeAt(0);
    }
    
    // 检查是否与现有高亮重叠
    const overlappingHighlights = checkHighlightOverlap(text, range);
    if (overlappingHighlights.length > 0) {
        // 如果重叠，合并高亮
        const longestElement = mergeOverlappingHighlights(overlappingHighlights);
        if (longestElement) {
            // 如果新文本更长，则更新高亮
            if (text.length > longestElement.textContent.length) {
                const textNode = document.createTextNode(text);
                longestElement.parentNode.replaceChild(textNode, longestElement);
                
                // 更新存储中的文本
                const highlightIndex = highlights.findIndex(h => h.id === longestElement.id);
                if (highlightIndex !== -1) {
                    highlights[highlightIndex].text = text;
                    saveHighlights();
                }
            }
            return;
        }
    }

    try {
        // 创建高亮元素
        const span = document.createElement('span');
        span.className = 'highlight-text';
        span.id = highlightId;
        span.style.cssText = `
            background-color: #ffff00;
            cursor: pointer;
            display: inline;
            padding: 0;
            margin: 0;
            border-radius: 2px;
        `;
        span.dataset.originalText = text;
        span.dataset.highlightId = highlightId;
        
        // 处理跨段落选择
        if (range.startContainer !== range.endContainer) {
            // 获取所有选中的节点
            const selectedNodes = getSelectedNodes(range);
            
            // 处理每个选中的节点
            selectedNodes.forEach((node, index) => {
                const nodeSpan = span.cloneNode(true);
                
                if (index === 0) {
                    // 处理开始节点
                    const startText = node.textContent;
                    const startIndex = range.startOffset;
                    nodeSpan.textContent = startText.substring(startIndex);
                    
                    // 创建并插入开始文本节点
                    const startTextNode = document.createTextNode(startText.substring(0, startIndex));
                    const parent = node.parentNode;
                    parent.insertBefore(startTextNode, node);
                    parent.insertBefore(nodeSpan, startTextNode.nextSibling);
                    parent.removeChild(node);
                } else if (index === selectedNodes.length - 1) {
                    // 处理结束节点
                    const endText = node.textContent;
                    const endIndex = range.endOffset;
                    nodeSpan.textContent = endText.substring(0, endIndex);
                    
                    // 创建并插入结束文本节点
                    const endTextNode = document.createTextNode(endText.substring(endIndex));
                    const parent = node.parentNode;
                    parent.insertBefore(nodeSpan, node);
                    parent.insertBefore(endTextNode, nodeSpan.nextSibling);
                    parent.removeChild(node);
                } else {
                    // 处理中间节点
                    nodeSpan.textContent = node.textContent;
                    const parent = node.parentNode;
                    parent.insertBefore(nodeSpan, node);
                    parent.removeChild(node);
                }
            });
        } else {
            // 单段落选择
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
        }

        // 清除选择
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
    } catch (e) {
        console.error('高亮创建失败:', e);
    }
}

// 获取选中的节点
function getSelectedNodes(range) {
    const nodes = [];
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walker.nextNode()) {
        if (isNodeInRange(node, range)) {
            nodes.push(node);
        }
    }
    
    return nodes;
}

// 检查节点是否在范围内
function isNodeInRange(node, range) {
    const nodeRange = document.createRange();
    nodeRange.selectNode(node);
    
    return range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 &&
           range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0;
}

// 保存高亮数据到存储
function saveHighlights() {
    try {
        chrome.storage.local.set({ highlights: highlights });
    } catch (e) {
        console.warn('保存高亮失败，可能是扩展上下文失效:', e);
    }
}

// 页面加载时加载高亮数据
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadHighlights();
        // 确保事件监听器被添加
        setTimeout(addHighlightClickListeners, 1000);
    });
} else {
    loadHighlights();
    // 确保事件监听器被添加
    setTimeout(addHighlightClickListeners, 1000);
}

// 添加页面可见性变化监听
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        loadHighlights();
        // 确保事件监听器被添加
        setTimeout(addHighlightClickListeners, 1000);
    }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        if (message.type === 'SCROLL_TO_HIGHLIGHT') {
            const element = document.getElementById(message.highlightId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
                // 添加闪烁效果
                element.style.animation = 'flash 1s';
                setTimeout(() => {
                    element.style.animation = '';
                }, 1000);
            }
        } else if (message.type === 'CLEAR_HIGHLIGHTS') {
            // 清除当前页面的所有高亮
            const currentUrl = window.location.href;
            const highlightElements = document.querySelectorAll('.highlight-text');
            highlightElements.forEach(element => {
                // 恢复原始文本
                const textNode = document.createTextNode(element.dataset.originalText || element.textContent);
                element.parentNode.replaceChild(textNode, element);
            });
            // 从列表中移除当前页面的高亮
            highlights = highlights.filter(h => h.url !== currentUrl);
            saveHighlights();
        } else if (message.type === 'DELETE_HIGHLIGHT') {
            // 删除单个高亮
            const element = document.getElementById(message.highlightId);
            if (element) {
                // 恢复原始文本
                const textNode = document.createTextNode(element.dataset.originalText || element.textContent);
                element.parentNode.replaceChild(textNode, element);
                
                // 从列表中移除
                highlights = highlights.filter(h => h.id !== message.highlightId);
                saveHighlights();
            }
        } else if (message.type === 'HIGHLIGHT_SELECTED_TEXT') {
            // 处理右键菜单的高亮请求
            const selection = window.getSelection();
            if (!selection.rangeCount) {
                console.warn('没有选中的文本');
                return;
            }
            
            const range = selection.getRangeAt(0);
            const text = range.toString().trim();
            
            if (text) {
                createHighlight(text);
            } else {
                console.warn('选中的文本为空');
            }
        }
    } catch (e) {
        console.warn('处理消息失败，可能是扩展上下文失效:', e);
    }
});

// 创建高亮
function createHighlight(text) {
    if (!text || text.trim() === '') {
        console.warn('高亮文本为空');
        return;
    }
    
    const highlightId = 'highlight-' + Date.now();
    
    // 获取当前选中的文本范围
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        console.warn('没有选中的文本');
        return;
    }
    
    const range = selection.getRangeAt(0);
    
    // 保存高亮信息
    const highlightInfo = {
        id: highlightId,
        text: text,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        // 保存选择范围信息
        range: {
            startContainer: {
                nodeType: range.startContainer.nodeType,
                nodeValue: range.startContainer.nodeValue,
                parentNode: {
                    nodeName: range.startContainer.parentNode.nodeName,
                    className: range.startContainer.parentNode.className,
                    id: range.startContainer.parentNode.id
                }
            },
            startOffset: range.startOffset,
            endContainer: {
                nodeType: range.endContainer.nodeType,
                nodeValue: range.endContainer.nodeValue,
                parentNode: {
                    nodeName: range.endContainer.parentNode.nodeName,
                    className: range.endContainer.parentNode.className,
                    id: range.endContainer.parentNode.id
                }
            },
            endOffset: range.endOffset
        }
    };
    
    try {
        // 应用高亮
        highlightText(text, highlightId, range);
        
        // 添加到高亮列表
        highlights.push(highlightInfo);
        saveHighlights();
        
        // 发送消息给popup更新列表
        try {
            chrome.runtime.sendMessage({
                type: 'NEW_HIGHLIGHT',
                data: highlightInfo
            });
        } catch (e) {
            console.warn('发送消息失败，可能是扩展上下文失效:', e);
        }
    } catch (error) {
        console.error('高亮失败:', error);
    }
} 